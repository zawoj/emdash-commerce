---
"@emdash-commerce/plugin-stripe": patch
---

The maintenance cron task skips every remaining step once a step has been cut off at the end of its time budget. Before, a timer that fired a millisecond early could start the next step with a budget that was already spent.
