/**
 * STATUS: UNVERIFIED — written from provider spec, never executed against the live API.
 * Cost math here has NOT been validated against real usage payloads. Wrong costs fail
 * SILENTLY (bad costUsd, not a crash). Run templates/VERIFY.md smoke tests before
 * trusting any number this adapter produces in a client-facing context.
 * Verified: <none>   Last spec review: 2026-07-19
 */

/**
 * Azure OpenAI — same wire shape as OpenAI, two cost problems OpenAI does not have.
 *
 * PROBLEM 1: DEPLOYMENT-NAME INDIRECTION. On Azure you do not call a model, you call a
 * DEPLOYMENT — an arbitrary name your platform team chose, pinned to some model at some
 * version. "prod-chat" or "gpt4-eastus" is what appears in your code and in your traces.
 *
 * This breaks cost attribution in a way that looks fine until it doesn't:
 *   - A deployment name is not a price-sheet key. Pricing "prod-chat" means pricing nothing.
 *   - The pin can be changed in the portal with no code change and no deploy. Your cost
 *     model silently starts describing a different model than the one running. That is what
 *     `modelDriftRate` in summarize() exists to surface.
 *   - Version-agnostic deployments auto-upgrade on Microsoft's schedule.
 *
 * So: `requestedModel` carries the deployment name, `servedModel` carries the model id the
 * RESPONSE reports, and the two are kept separate all the way to the ledger. The response's
 * `model` field is the pricing key. If they diverge, that is information, not an error to
 * normalise away.
 *
 * PROBLEM 2: RESIDENCY-CONSTRAINED RATE MULTIPLIER. Azure prices the same model differently
 * by routing tier — a global tier at the list rate, and residency-constrained tiers (data
 * zone, and for some legacy model families regional) at a multiplier above it. There are two
 * further orthogonal axes a naive per-MTok schema drops entirely: a long-context surcharge
 * above a context threshold on some models, and a priority-processing surcharge. Batch runs
 * below list.
 *
 * The adapter reports the tier and the context size; `pricing.ts` applies the multiplier
 * from the sheet. Adapters never do money. Rates and multipliers: sota-snapshot.md.
 *
 * ⚠ SEEDING TRAP, reproduced twice during research and worth naming here because this is the
 * file someone will be reading when they hit it: the Azure retail price feed has been
 * observed returning a data-zone model's input and output meters TRANSPOSED. Seeding a
 * price sheet straight from that feed encodes a several-fold input overcharge that looks
 * entirely plausible. This is why the price sheet asserts at load that output rate exceeds
 * input rate for every text model row. Do not remove that assertion.
 *
 * Usage semantics are identical to OpenAI: input is INCLUSIVE of cached tokens (subtract
 * once), reasoning is a NESTED breakdown of output (never add it on top).
 */

import {
  AdapterError,
  type AdapterRequest,
  type AdapterResponse,
  type LlmAdapter,
} from './types.ts';
import {
  normalizeOpenAiChatUsage,
  normalizeOpenAiResponsesUsage,
  type OpenAiChatUsage,
  type OpenAiResponsesUsage,
  type OpenAiSurface,
} from './openai.ts';

const PROVIDER = 'azure-openai' as const;

/** Routing tiers Azure prices differently. `pricing.ts` maps tier to multiplier. */
export type AzureRoutingTier = 'global-standard' | 'data-zone-standard' | 'regional-standard';

export interface AzureOpenAiAdapterOptions {
  /** e.g. https://my-resource.openai.azure.com */
  endpoint: string;
  apiKey: string;
  /** The DEPLOYMENT name, not a model id. This is the indirection. */
  deployment: string;
  apiVersion: string;
  surface?: OpenAiSurface;
  /**
   * Which routing tier this deployment was provisioned on. There is no reliable way to read
   * this back from a completion response, so it is configuration — and it must match what
   * the portal actually shows, or every cost figure from this deployment is off by the
   * multiplier. Check it when you check the deployment's model pin.
   */
  routingTier?: AzureRoutingTier;
  /** Priority processing carries a surcharge. Reported so pricing can apply it. */
  priority?: boolean;
  fetchImpl?: typeof fetch;
}

export function createAzureOpenAiAdapter(opts: AzureOpenAiAdapterOptions): LlmAdapter {
  const doFetch = opts.fetchImpl ?? fetch;
  const surface: OpenAiSurface = opts.surface ?? 'chat';
  const routingTier: AzureRoutingTier = opts.routingTier ?? 'global-standard';

  return {
    provider: PROVIDER,
    billable: true,
    supportsBatch: true,
    supportsExplicitCache: false,

    async complete(req: AdapterRequest): Promise<AdapterResponse> {
      if (req.batch) {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'Azure batch runs against a separate batch deployment and is an asynchronous ' +
            'submit-and-poll flow, not a complete() call.',
        );
      }
      if (req.cache?.mode === 'explicit') {
        throw new AdapterError(
          PROVIDER,
          'unsupported-capability',
          'Prompt caching is automatic and has no explicit handle. The lever is prefix ' +
            'stability — stable instructions and schemas first, byte-identical, with ' +
            'anything volatile after. Verify with cached_tokens > 0 on a repeat call.',
        );
      }

      // Note the deployment name in the path where a model id would be on OpenAI. The
      // `model` field in the body is ignored by Azure; the URL is what selects the model.
      const base = opts.endpoint.replace(/\/+$/, '');
      const url =
        surface === 'responses'
          ? `${base}/openai/responses?api-version=${encodeURIComponent(opts.apiVersion)}`
          : `${base}/openai/deployments/${encodeURIComponent(opts.deployment)}` +
            `/chat/completions?api-version=${encodeURIComponent(opts.apiVersion)}`;

      const messages = [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ];
      const body: Record<string, unknown> =
        surface === 'responses'
          ? {
              model: opts.deployment,
              ...(req.system ? { instructions: req.system } : {}),
              input: req.messages.map((m) => ({ role: m.role, content: m.content })),
              max_output_tokens: req.maxOutputTokens,
            }
          : {
              messages,
              max_completion_tokens: req.maxOutputTokens,
              ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
              ...(req.stopSequences ? { stop: req.stopSequences } : {}),
              ...(req.responseFormat === 'json'
                ? { response_format: { type: 'json_object' } }
                : {}),
            };

      const controller = new AbortController();
      const timer = req.timeoutMs
        ? setTimeout(() => controller.abort(), req.timeoutMs)
        : null;
      req.signal?.addEventListener('abort', () => controller.abort(), { once: true });

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'api-key': opts.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (cause) {
        const aborted = controller.signal.aborted;
        throw new AdapterError(
          PROVIDER,
          aborted ? 'timeout' : 'network-error',
          String(cause),
          { cause },
        );
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (!res.ok) throw await classifyAzureError(res);
      const json = (await res.json()) as Record<string, unknown>;

      const usage =
        surface === 'responses'
          ? normalizeOpenAiResponsesUsage(json.usage as OpenAiResponsesUsage)
          : normalizeOpenAiChatUsage(json.usage as OpenAiChatUsage);

      const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
      const msg = choice?.message as { content?: string } | undefined;
      const text =
        surface === 'responses'
          ? ((json.output_text as string) ?? '')
          : (msg?.content ?? '');

      /**
       * The served model. Azure echoes the underlying model id here — this is the pricing
       * key, and it is NOT the deployment name. When it disagrees with what you believe the
       * deployment is pinned to, someone changed the pin in the portal: your cost model has
       * been describing a different model than the one that ran. That is exactly the drift
       * `modelDriftRate` was added to catch, so let it reach the ledger unmodified.
       */
      const servedModel = (json.model as string) ?? `azure-deployment:${opts.deployment}`;

      return {
        text,
        requestedModel: opts.deployment,
        servedModel,
        usage,
        finishReason:
          (choice?.finish_reason as string) ?? ((json.status as string) ?? null),
        billable: true,
        notionalCostUsd: null,
        providerMeta: {
          surface,
          deployment: opts.deployment,
          routingTier,
          priority: opts.priority === true,
          apiVersion: opts.apiVersion,
          // Long-context surcharges are a step function on prompt size on some models.
          // Report the size; the sheet decides whether this model has a threshold.
          promptTokensForContextTier: usage
            ? usage.inputTokens + usage.cacheReadTokens
            : null,
          deploymentPinMatchesServed: null as boolean | null,
        },
      };
    },
  };
}

async function classifyAzureError(res: Response): Promise<AdapterError> {
  const bodyText = await res.text().catch(() => '');
  const retryAfter = Number(res.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined;

  if (res.status === 429) {
    // Azure 429s are usually a provisioned-throughput or TPM ceiling — transient, and the
    // Retry-After header is meaningful. Quota exhaustion looks different and must not be
    // retried, because retrying pays the failure latency for a guaranteed failure.
    const exhausted = /quota|exceeded.*quota|subscription/i.test(bodyText);
    return new AdapterError(
      PROVIDER,
      exhausted ? 'quota-exhausted' : 'rate-limited',
      bodyText.slice(0, 400),
      { retryAfterMs },
    );
  }
  if (res.status === 401 || res.status === 403) {
    return new AdapterError(PROVIDER, 'not-authenticated', bodyText.slice(0, 400));
  }
  if (res.status === 404) {
    return new AdapterError(
      PROVIDER,
      'api-error',
      'Deployment not found. On Azure the deployment name in the URL selects the model — ' +
        'a typo here is a 404, not a fallback to a default. ' +
        bodyText.slice(0, 300),
    );
  }
  if (/content_filter|ResponsibleAI/i.test(bodyText)) {
    return new AdapterError(PROVIDER, 'content-filtered', bodyText.slice(0, 400));
  }
  if (res.status === 400 && /context length|maximum context/i.test(bodyText)) {
    return new AdapterError(PROVIDER, 'context-length-exceeded', bodyText.slice(0, 400));
  }
  return new AdapterError(
    PROVIDER,
    res.status >= 500 ? 'overloaded' : 'api-error',
    `HTTP ${res.status}: ${bodyText.slice(0, 400)}`,
    { retryAfterMs },
  );
}
