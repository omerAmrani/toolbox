# Q&A

Generates comprehension questions from a lecture summary and evaluates user answers. Uses Claude only.

## API

- Module: `QaModule`
- Routes (via `LecturesController`):
  - `GET .../qa` — fetch all Q&A rounds for a lecture (`{ rounds[] }`)
  - `POST .../qa/generate` — generate questions from current summary; appends a new round to `qa.json`
  - `POST .../qa/answer` with `{ roundIndex, answers[] }` — evaluate answers, save feedback

**Flow:**
1. Requires a current summary to exist
2. `QaService.generateQuestions(summaryContent)` → returns question list
3. Round appended to `qa.json`: `{ questions, answers: [], feedback: [], timestamp }`
4. User submits answers; `QaService.evaluateAnswers(questions, answers)` → returns feedback per answer
5. Round updated in `qa.json` with answers + feedback

**Storage:** `data/classes/<classId>/lectures/<lectureId>/qa.json`

**Gotcha:** multiple rounds are supported — each generate call appends a new round.

## Web

- Lecture detail page — Q&A section with generate, answer input, and feedback display
- See [lectures.md](../../open-uni-recorder-web/docs/lectures.md)
