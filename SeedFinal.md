Step A — Seed “SunnySteps Demand Signals” (Questions)

We need a SunnySteps ecommerce question bank focused on Singapore and omnichannel.

Create / store questions for industry=ecommerce_shoes, geo=SG-Orchard-MBS, language=en, persona=consumer.

Use the exact list below (v1). Assign “impact/weight” mentally: Delivery/Returns/Availability highest.

SunnySteps Question List (v1)

Availability / local
	1.	Is this shoe available in Singapore right now?
	2.	Is it available near Orchard or Marina Bay Sands (MBS) today?
	3.	Can I reserve online and pick up in store?
	4.	Do you restock sold-out sizes? When?
	5.	Do you have a physical store in Singapore? Where?
	6.	What are your store hours in Singapore?

Delivery
7. How long is delivery in Singapore?
8. Do you offer next-day delivery in Singapore?
9. Do you offer same-day delivery?
10. What is the delivery fee in Singapore?
11. Do you deliver to Orchard / Downtown / CBD?

Returns / exchanges
12. What is your return policy?
13. Are returns free in Singapore?
14. How do exchanges work for size changes?
15. How long do refunds take?
16. Can I return in store (if bought online)?

Sizing / fit
17. Is the fit true-to-size?
18. Does it run narrow or wide?
19. Is it good for wide feet?
20. Do you have a size guide (US/EU/UK conversion)?
21. Is it comfortable for walking all day?

Materials / care
22. What materials is it made from?
23. Is it breathable for Singapore weather?
24. Is it water-resistant?
25. How do I clean it?
26. Can I machine wash it?

Occasion / use cases
27. Is this good for office wear?
28. Is this good for parties / weddings?
29. Is this good for travel?
30. Is this good for standing long hours?

Trust / proof
31. What do customers say about comfort and durability?
32. Are reviews verified?
33. Why should I trust the sizing recommendation?
34. What are common complaints about this shoe?
35. What’s the best alternative if my size is out of stock?

Product discovery
36. Which sneaker is best for comfort + style?
37. Which shoe is best for all-day walking in Singapore?
38. What shoes go well with smart-casual outfits?
39. What’s the difference between model A and model B?
40. Is there a discount or promotion available?

Requirement
	•	These questions must show up in Discovery → Demand Signals for domain sunnysteps.com.

⸻

Step B — LLM Probing (answers + weakness scoring)

We already have scripts to probe customer questions using LLMs.

Update prompting so answers are:
	•	Singapore location aware (Orchard + MBS)
	•	If unverifiable, LLM must return a clearly machine-detectable pattern like:
NOT_VERIFIABLE: <missing info needed>

We will store these answers and use them to:
	•	compute visibility/answer readiness
	•	generate recommendations (weak answers become content opportunities)

Requirement
	•	After probing, Discovery must show which questions are “weak/unverified” (even if site has no gap).
	•	Do not fake citations. If citations aren’t implemented, omit and rely on hedging/unverifiable markers.

⸻

Step C — Gaps definition (must be consistent everywhere)

We use “Gaps” in UI as missing facts OR weak LLM answers:
	•	Missing site facts: required claim key missing for the question (QuestionNeed without Claim attached)
	•	Weak LLM answers: answer exists but is hedged/unverifiable

UI copy must show:
	•	“Gap = Missing site fact OR weak LLM answer”
Make this a tooltip or inline helper text.

⸻

Step D — Content Recommendations generation (real, not seeded)

Recommendations must be derived from:
	•	the question list
	•	latest probe answers
	•	missing claim needs
	•	(optionally) crawl evidence where available

For each recommended fix, generate a draft target:
	1.	FAQ Draft: direct Q → direct A, with “Verified facts” + “Trust signals”
	2.	Blog Draft: helpful long-form where relevant (delivery, returns, sizing guide, occasion)
	3.	Product Draft: 
	•	Trust Signals
	•	Use Cases
	•	Local Availability Note
	•	Fit / Materials / Care / Occasion
	•	Set LLM Gap Fixed = true
	•	Set Last Verified At = now

	Publishing flow must feel premium:
	•	
	•	Shows:
	•	“What question are we fixing?”
	•	“Why it matters (impact score)”
	•	“What will be published (FAQ / Blog / Product)”
	•	