# Prompt: Generate a High-Yield Summary Tab for a Condition

Use this prompt to generate a "Summary" tab with accordion-based high-yield Q&A for any condition page in MBBSpedia.

---

## Instructions

Given a condition with existing Etiology, DDx, Dx, Mx, and Complications fragments, generate a `summary.mdx` file that:

1. **Reads all 5 existing fragment files** for the condition to understand the full content
2. **Extracts the most high-yield, exam-critical questions** across all sections
3. **Formats them as accordion Q&As** using fumadocs-ui Accordion components
4. **Groups questions by section** (Etiology & Pathophysiology, DDx, Dx, Mx, Complications)

## Target Audience

HKU Med students preparing for **clinical summative exams** (surgical vivas, written papers). Questions should target:

- Classic definitions with specific numerical criteria
- Key anatomical landmarks and their clinical significance
- Must-know differentials (especially table-format comparisons)
- Investigation thresholds and contraindications
- Management algorithms and decision points
- Complications with their mechanisms and prevention
- Common exam traps and frequently tested "don't miss" diagnoses

## File Structure

### Fragment file: `content/fragments/general-surgery/<condition>/summary.mdx`

```mdx
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';

## High-Yield Summary — <Condition Name>

Use these accordion Q&As to test yourself on the most commonly examined points for this condition. Each question targets a concept that has appeared in HKU Med clinical summative exams or is considered "must-know" for surgical vivas.

---

### Etiology & Pathophysiology

<Accordions type="single">

<Accordion title="Question text here?">
Answer with **bold** key terms, tables where appropriate, and concise explanations.
</Accordion>

<!-- More accordions... -->

</Accordions>

---

### Differential Diagnosis

<Accordions type="single">
<!-- Accordions... -->
</Accordions>

---

### Diagnosis & Investigations

<Accordions type="single">
<!-- Accordions... -->
</Accordions>

---

### Management

<Accordions type="single">
<!-- Accordions... -->
</Accordions>

---

### Complications

<Accordions type="single">
<!-- Accordions... -->
</Accordions>
```

### Main doc file update

Add to the main condition `.mdx` file:

1. Add import: `import SummarySection from "../../fragments/general-surgery/<condition>/summary.mdx";`
2. Update Tabs items array to include `"Summary"` as the 6th item
3. Add the tab:
```mdx
<Tab value="Summary">
  <SummarySection components={props.components} />
</Tab>
```

## Guidelines

- **Aim for 4–6 accordions per section** (20–30 total per condition)
- **Use tables** for comparison questions (venous vs arterial, EVLA vs RFA, etc.)
- **Bold all key terms** and numerical values that are commonly tested
- **Include mnemonics** where they exist in the source material
- **Each answer should be self-contained** — a student should understand the answer without needing to read the full notes
- **Prioritise "classic exam questions"** — definitions with specific criteria, investigation thresholds, contraindications, and named syndromes/signs
- Use `type="single"` on Accordions so only one is open at a time (forces active recall)
- Keep answers concise but complete — aim for the "perfect viva answer" length

## Example Prompt to Claude

> Read all 5 fragment files for `<condition>` at `content/fragments/general-surgery/<condition>/`. Then create a `summary.mdx` file following the template in `prompts/generate-summary-tab.md`. Extract the most high-yield exam questions across etiology, ddx, dx, mx, and complications. Also update the main condition page to add the Summary tab.
