# HTML brief notes

Load `artifact-design` first. Treat the page as a product, visual first with little text.

## Sections that worked
- hero with an animated flow of the client's core process
- who they are, live signals timeline
- today vs target architecture toggle
- product tabs with today, tomorrow, differently
- top 5 challenges selector
- AI opportunities and roadmap timeline
- competitor tiers with filters
- news cards tagged risk or opportunity
- score bars that expand to explain each rubric dimension
- copyable discovery questions, objections as flip cards, next step

## Gotchas
- SVG elements ignore `.hidden`. Use `el.toggleAttribute('hidden', flag)` and add `[hidden]{display:none!important}`.
- Today and target views must look different, not only relabelled.
- Explain every score or total on the page.
- Screenshot each toggle and tab state at desktop and phone width before publishing.
- Keep the same artifact URL on republish, pass `url` if the file path changed.
- Run the em dash and semicolon gate on visible text.
