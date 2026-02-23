# Plan: Implement Job Description Validation

## Objective
Implement a `validateJobDescription` function in `src/resume-ai/resume-ai.service.ts` to validate job descriptions against specific business rules using regex and NLP techniques.

## Steps

1.  **Dependencies**
    *   Install `segment` (a pure JavaScript Chinese word segmentation library) to handle keyword extraction and matching.
    *   Command: `pnpm add segment`
    *   *Rationale*: The requirement specifies using an NLP library. `segment` is pure JS, avoiding potential native build issues on Windows with `nodejieba`.

2.  **Define Constants**
    *   Create `src/resume-ai/constants/job-validation.constants.ts`.
    *   Define `PREDEFINED_TECH_STACK`: A comprehensive list of technical keywords (e.g., 'Vue', 'React', 'Java', 'Python', 'Node.js', etc.).
    *   Define `REQUIRED_SECTIONS`: ['岗位职责', '任职要求', '薪资范围', '工作地点'].
    *   Define `PROHIBITED_TERMS`: ['男女不限', '年龄不限'].

3.  **Implement Validation Logic**
    *   Modify `src/resume-ai/resume-ai.service.ts` to import `Segment` and the constants.
    *   Implement `validateJobDescription(jobDescription: string)` method.
    *   **Validation Rules & Scoring (Total 100)**:
        1.  **Length Check (10 pts)**:
            *   Range: 150 - 2000 characters.
        2.  **Section Check (40 pts)**:
            *   Must contain all `REQUIRED_SECTIONS`. 10 points per section.
        3.  **Discriminatory Content Check (10 pts)**:
            *   Must NOT contain `PROHIBITED_TERMS`.
        4.  **Skill Keyword Matching (20 pts)**:
            *   Use `segment` to tokenize the job description.
            *   Extract unique keywords from the description.
            *   Calculate match percentage = (matched keywords / total unique keywords in description) * 100 ?? No, usually it's "description contains X% of known tech stack" or "extracted keywords that match tech stack".
            *   Refined logic: Extract all words. Filter those that appear in `PREDEFINED_TECH_STACK`. The requirement says "Skill keywords must match predefined tech stack >= 60%". This phrasing is ambiguous. It likely means "Of the potential technical keywords found in the text, or of the text's significant words, what portion matches the stack?"
            *   Let's interpret it as: "The job description should contain enough relevant keywords." Or maybe "The keywords extracted from the JD should be valid tech terms."
            *   Re-reading: "技能关键词需与预定义技术栈列表匹配度≥60%" (Skill keywords need to match the predefined tech stack list >= 60%).
            *   Interpretation: I will extract "skill-like" words (using the tech stack list as a filter) and maybe check if the JD has *any* skills? Or maybe check if the "keywords" extracted by the NLP tool are in the tech stack?
            *   Let's go with: Extract potential keywords (nouns/eng). Count how many are in `PREDEFINED_TECH_STACK`. If the count of matched keywords / total extracted "meaningful" keywords >= 60%? That seems hard to define "meaningful".
            *   Alternative Interpretation: "The JD must cover at least 60% of *some* expected skills?" Unlikely.
            *   Most likely interpretation for a validator: "Of the technical terms found, are they standard?" Or "Does the JD contain enough technical terms?"
            *   Let's assume the requirement means: "The set of keywords extracted from the JD must have a >= 60% intersection with the predefined tech stack."
            *   Wait, if I extract "Vue", "development", "good". "Vue" is in stack. "development" is not. "good" is not. 33%. This seems strict.
            *   Let's simplify: "Identify tech keywords in the JD. Calculate a score based on presence."
            *   Actually, let's look at the phrasing again: "Skill keywords match degree >= 60%".
            *   Maybe it means: `(Count of keywords in JD that are in TechStack) / (Count of keywords in JD that look like skills) >= 0.6`.
            *   To implement this simply and robustly: I will treat the "Predefined Tech Stack" as the universe of valid skills. I will use the NLP library to segment the text. I will count how many unique words match the tech stack. If the count is 0, score 0. If > 0, I need a denominator.
            *   Maybe the requirement implies: "Of the specific requirements section, 60% of the keywords should be in our dictionary?"
            *   Let's just implement a check: `(matched_keywords_count / total_segments_length)`. No, that's too low.
            *   Let's use a heuristic: The JD must contain at least X keywords from the stack?
            *   Let's stick to the user's literal instruction: "Skill keywords... matching degree >= 60%". I will define "Skill Keywords" as words identified as Nouns/Eng by the segmenter. I will calculate `(Words in JD that are in Tech Stack) / (All Tech Stack Words)`? No, that requires the JD to list everything.
            *   I will assume it means: `(Unique Tech Stack Words Found in JD) / (Total Unique Words in JD that *could* be skills)`. Identifying "could be skills" is hard.
            *   **Decision**: I will verify if the job description contains keywords from the predefined list. I will calculate the "density" or just check if it meets a threshold.
            *   *Correction*: I will calculate the ratio of `(Unique words in JD that are in TechStack) / (Total Unique Words in TechStack)`. No, that forces a huge JD.
            *   *Correction 2*: I will extract top keywords using `segment`'s ranking (if available) or just frequency. Let's say top 10 keywords. Check how many are in the TechStack. If 6/10 are in TechStack, match is 60%. This is a standard NLP approach (Keyword Extraction -> Match).
            *   Implementation: Use `segment` to get top keywords. Calculate percentage of those that are in `PREDEFINED_TECH_STACK`. Pass if >= 60%.
        5.  **Salary Format Check (10 pts)**:
            *   Regex: `(\d+)-(\d+)k\/月` or `(\d+)-(\d+)万\/年`.
        6.  **Location Check (10 pts)**:
            *   Must contain "市" (City).
    *   **Return**: `{ isValid, errors, score }`. `isValid` is true only if no blocking errors (length, sections, discriminatory, salary, location) and score >= threshold (e.g. 60 or 80?). The prompt implies "isValid" is the result of the check. I will set `isValid` to true if all "hard" rules pass (no discriminatory terms, valid format) and score is decent.
    *   Actually, the prompt says "validate... checks must cover...". I will treat them as hard constraints for `isValid`?
    *   "Length... Must contain... Forbidden... Match >= 60%... Format...". These sound like hard rules.
    *   So `isValid` = true ONLY IF all conditions are met.

4.  **Verification**
    *   Create a test script or use a temporary test file to call the function with sample JDs (valid and invalid) and print the results.

5.  **Refinement**
    *   Ensure strict typing and comments as per workspace rules.

