---
name: emr-form-creator
description: Create exact copies of mapped EMR forms in MediMind. Takes mapped fields from emr-page-mapper and generates template files, recreation scripts, and creates forms in the database.
model: sonnet
color: green
---

# EMR Form Creator Agent

Creates exact copies of original EMR forms in the MediMind system from mapped field data and screenshots.

## Prerequisites

**Input Required (from emr-page-mapper agent):**
- Mapped fields JSON or markdown table
- Screenshot images of the original form
- Dropdown options with values and labels
- Form identifier (e.g., IV-200-5/a, IV-100/a)

## Workflow

### Step 1: Analyze Mapped Data

Parse the mapped form data to extract:
- Form title and identifier
- All field definitions (ID, type, label, required, validation)
- Dropdown options with numeric codes and Georgian labels
- Checkbox-group configurations (inline options, hasTextField)
- Layout information (field widths, sections, inline groupings)

### Step 2: Create Template File

Create `packages/app/src/emr/data/form-templates/form-XXX-template.ts`:

```typescript
import type { FormTemplate, FieldConfig, DropdownOption } from '../../types/form-builder';

export const FORM_XXX_ID = 'form-xxx-description';
export const FORM_XXX_VERSION = '1.0.0';

// Dropdown options (if any)
export const dropdownName: DropdownOption[] = [
  { value: 'code', label: 'ქართული ტექსტი', labelEn: 'English text' },
];

export const formXXXFields: FieldConfig[] = [
  // Fields go here
];

export const formXXXTemplate: FormTemplate = {
  id: FORM_XXX_ID,
  title: 'ფორმის სათაური',
  description: '',
  status: 'active',
  version: FORM_XXX_VERSION,
  fields: formXXXFields,
  category: ['medical-forms', 'georgian-healthcare'],
  resourceType: 'Questionnaire',
};

export default formXXXTemplate;
```

### Step 3: Create Recreation Script

Create `scripts/recreate-form-XXX.ts` based on existing scripts.

### Step 4: Execute Form Creation

```bash
# Get token from user
export MEDPLUM_TOKEN="user-provided-token"

# Run script
npx tsx scripts/recreate-form-XXX.ts
```

---

## Field Type Reference

### Text Input (Underline Style)
```typescript
{
  id: 'field-patient-name',
  linkId: 'patient-name',
  type: 'text',
  label: 'პაციენტი',
  required: false,
  patientBinding: { enabled: true, bindingKey: 'fullName' },
  styling: { width: '50%' },
  order: 1,
}
```

### Textarea (Resizable White Box)
```typescript
{
  id: 'field-notes',
  linkId: 'notes',
  type: 'textarea',
  label: '',  // Empty label = no label shown
  required: false,
  styling: { width: '100%', height: '80px', resizable: true },
  order: 2,
}
```

### Checkbox-Group (Inline with Optional Text Field)
```typescript
{
  id: 'field-condition',
  linkId: 'general-condition',
  type: 'checkbox-group',
  label: 'ზოგადი მდგომარეობა:',
  options: [
    { value: 'mild', label: 'მსუბუქი' },
    { value: 'moderate', label: 'საშუალო' },
    { value: 'severe', label: 'მძიმე' },
  ],
  hasTextField: true,  // Adds underline text field at end
  order: 3,
}
```

### Section Header (Centered Blue Text)
```typescript
{
  id: 'section-objective',
  linkId: 'objective-section',
  type: 'display',
  label: 'ობიექტური მონაცემები',
  order: 4,
}
```

### Dropdown (Choice)
```typescript
{
  id: 'field-gender',
  linkId: 'gender',
  type: 'choice',
  label: 'სქესი',
  options: [
    { value: 'male', label: 'მამრობითი' },
    { value: 'female', label: 'მდედრობითი' },
  ],
  styling: { width: '25%' },
  order: 5,
}
```

### Date Field
```typescript
{
  id: 'field-exam-date',
  linkId: 'exam-date',
  type: 'date',
  label: 'თარიღი',
  required: false,
  styling: { width: '25%' },
  order: 6,
}
```

### Pre-filled Field (Default Value)
```typescript
{
  id: 'field-consultation-type',
  linkId: 'consultation-type',
  type: 'text',
  label: 'კონსულტაციის სახე',
  defaultValue: 'ამბულატორიული',  // Auto-filled
  required: false,
  styling: { width: '50%' },
  order: 7,
}
```

---

## Layout Patterns

### Full-Width Row
Fields that span the entire width:
- Section headers (`type: 'display'`)
- Checkbox-group rows
- Textareas

### Inline Fields (Same Row)
Multiple fields on same row using width percentages:
```typescript
// "პაციენტი _____ ასაკი _____" on same line
{
  id: 'field-patient',
  linkId: 'patient',
  type: 'text',
  label: 'პაციენტი',
  styling: { width: '50%' },
  order: 1,
},
{
  id: 'field-age',
  linkId: 'age',
  type: 'text',
  label: 'ასაკი',
  styling: { width: '25%' },
  order: 2,
}
```

---

## Patient Data Bindings

Auto-populate fields from Patient/Encounter:

| Binding Key | Source | Example |
|-------------|--------|---------|
| `fullName` | Patient.name | თენგიზი ხოზვრია |
| `firstName` | Patient.name.given | თენგიზი |
| `lastName` | Patient.name.family | ხოზვრია |
| `dob` | Patient.birthDate | 1986-01-26 |
| `personalId` | Patient.identifier | 26001014632 |
| `gender` | Patient.gender | male |
| `phone` | Patient.telecom | +995500050610 |
| `age` | Calculated from DOB | 38 |
| `registrationNumber` | Encounter.identifier | 10357-2025 |

Usage:
```typescript
patientBinding: { enabled: true, bindingKey: 'fullName' }
```

---

## FHIR Type Mapping

| Template Type | FHIR Type | Notes |
|---------------|-----------|-------|
| `text` | `string` | Short text input |
| `textarea` | `text` | Long text, resizable |
| `date` | `date` | Date picker |
| `datetime` | `dateTime` | Date + time |
| `time` | `time` | Time only |
| `integer` | `integer` | Whole numbers |
| `decimal` | `decimal` | Decimal numbers |
| `boolean` | `boolean` | Single checkbox |
| `choice` | `choice` | Dropdown select |
| `checkbox-group` | `choice` + `repeats: true` | Multiple inline checkboxes |
| `display` | `display` | Section header (read-only) |
| `group` | `group` | Field grouping |

---

## Checkbox-Group to FHIR

Checkbox-groups are stored as FHIR `choice` with `repeats: true`:

```typescript
// Template
{
  type: 'checkbox-group',
  label: 'ზოგადი მდგომარეობა:',
  options: [
    { value: 'mild', label: 'მსუბუქი' },
    { value: 'severe', label: 'მძიმე' },
  ],
  hasTextField: true,
}

// Converts to FHIR QuestionnaireItem
{
  linkId: 'general-condition',
  text: 'ზოგადი მდგომარეობა:',
  type: 'choice',
  repeats: true,  // Enables multi-select
  answerOption: [
    { valueCoding: { code: 'mild', display: 'მსუბუქი' } },
    { valueCoding: { code: 'severe', display: 'მძიმე' } },
  ],
  extension: [
    { url: 'http://medimind.ge/has-text-field', valueBoolean: true }
  ]
}
```

---

## Complete Example: Form IV-200-5/a

### Mapped Fields (from emr-page-mapper)

| Field | Type | Label | Options/Notes |
|-------|------|-------|---------------|
| form-number | display | ფორმა №IV-200-5/ა | Header |
| consultation-type | text | კონსულტაციის სახე | Default: ამბულატორიული |
| medical-card | text | ბარათის სამედიცინო № | Patient binding |
| patient-name | text | პაციენტი | Patient binding (fullName) |
| patient-age | text | ასაკი | Patient binding (age) |
| notes-1 | textarea | (no label) | Resizable |
| notes-2 | textarea | (no label) | Resizable |
| objective-section | display | ობიექტური მონაცემები | Section header |
| general-condition | checkbox-group | ზოგადი მდგომარეობა: | მსუბუქი, საშუალო, მძიმე, უმძიმესი |
| skin-mucous | checkbox-group | კანი და ლორწოვანი: | ფერმკრთალი, სველი, etc. + text |
| ... | ... | ... | ... |

### Generated Template

See: `packages/app/src/emr/data/form-templates/form-200-5a-template.ts`

---

## Execution Checklist

When creating a form, verify:

- [ ] All fields from mapping are included
- [ ] Georgian labels match exactly
- [ ] Checkbox-groups have correct options
- [ ] hasTextField set where needed
- [ ] Default values set for pre-filled fields
- [ ] Patient bindings configured
- [ ] Field widths match original layout
- [ ] Section headers are centered
- [ ] Textareas are resizable
- [ ] Empty labels for unlabeled fields
- [ ] Order matches original form flow

---

## Output Report

After creating a form, report:

```
## Form Created Successfully

**Form:** [Form Name] (Form ID)
**Template:** packages/app/src/emr/data/form-templates/form-XXX-template.ts
**Script:** scripts/recreate-form-XXX.ts
**FHIR ID:** [uuid from Medplum]

**Field Breakdown:**
- Total fields: X
- Text inputs: X
- Textareas: X
- Checkbox-groups: X
- Dropdowns: X
- Sections: X

**Status:** Active
**Refresh browser to see the form**
```

---

## Troubleshooting

### FHIR Constraint que-6 Error
> "Required and repeat aren't permitted for display items"

**Fix:** Don't set `required: true` on `display` or `group` type fields.

### Checkbox-groups Not Rendering
Ensure FormField.tsx detects `choice` + `repeats: true` as checkbox-group.

### Labels Showing linkId
If fields show "notes-1" instead of empty, ensure:
1. Template has `label: ''`
2. Recreate script only sets `text` when label is not empty
3. FormField uses `item.text || ''` not `item.text || item.linkId`

### Form Not Appearing
1. Check Medplum server running (http://localhost:8103)
2. Verify token is valid
3. Clear browser cache and refresh
4. Check form status is 'active'

---

## Quick Command Reference

```bash
# Create form from template
export MEDPLUM_TOKEN="your-token"
npx tsx scripts/recreate-form-XXX.ts

# Verify form exists
curl -H "Authorization: Bearer $MEDPLUM_TOKEN" \
  "http://localhost:8103/fhir/R4/Questionnaire?_summary=count"
```

---

**Rule: Match the original EMR form EXACTLY. Every field, every label, every option.**
