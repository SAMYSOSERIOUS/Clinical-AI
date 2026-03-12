"""
ICD-9 code lookup utilities.
Two-layer fallback: icd9cms library → hand-curated dictionary → prefix match.
Plain functions (no LangChain decorator) — the agent wrapper lives in clinical_agent.py.
"""

ICD9_CLINICAL_DICT: dict[str, str] = {
    "250":    "diabetes mellitus",
    "250.0":  "diabetes mellitus without complication",
    "250.00": "diabetes mellitus without complication type II",
    "250.01": "diabetes mellitus without complication type I",
    "250.02": "diabetes mellitus without complication type II uncontrolled",
    "250.03": "diabetes mellitus without complication type I uncontrolled",
    "250.1":  "diabetes with ketoacidosis",
    "250.10": "diabetes with ketoacidosis type II",
    "250.11": "diabetes with ketoacidosis type I",
    "250.13": "diabetes with ketoacidosis type I uncontrolled",
    "250.2":  "diabetes with hyperosmolarity",
    "250.3":  "diabetes with diabetic coma",
    "250.4":  "diabetes with renal manifestations",
    "250.40": "diabetes with renal manifestations type II",
    "250.41": "diabetes with renal manifestations type I",
    "250.43": "diabetes with renal manifestations type I uncontrolled",
    "250.5":  "diabetes with ophthalmic manifestations",
    "250.6":  "diabetes with neurological manifestations",
    "250.7":  "diabetes with peripheral circulatory disorders",
    "250.8":  "diabetes with other specified manifestations",
    "250.9":  "diabetes with unspecified complication",
    "401":    "essential hypertension",
    "401.9":  "essential hypertension unspecified",
    "402":    "hypertensive heart disease",
    "402.91": "hypertensive heart disease with heart failure",
    "403":    "hypertensive chronic kidney disease",
    "403.91": "hypertensive chronic kidney disease stage V end stage",
    "410":    "acute myocardial infarction",
    "410.9":  "acute myocardial infarction unspecified site",
    "411":    "acute ischemic heart disease",
    "411.1":  "intermediate coronary syndrome unstable angina",
    "414":    "chronic ischemic heart disease",
    "414.0":  "coronary atherosclerosis",
    "414.01": "coronary atherosclerosis native vessel",
    "427":    "cardiac dysrhythmia",
    "427.31": "atrial fibrillation",
    "427.5":  "cardiac arrest",
    "428":    "heart failure",
    "428.0":  "congestive heart failure unspecified",
    "428.1":  "left heart failure",
    "428.2":  "systolic heart failure",
    "428.3":  "diastolic heart failure",
    "429":    "ill-defined heart disease",
    "584":    "acute kidney failure",
    "585":    "chronic kidney disease",
    "585.1":  "chronic kidney disease stage I",
    "585.2":  "chronic kidney disease stage II",
    "585.3":  "chronic kidney disease stage III",
    "585.4":  "chronic kidney disease stage IV",
    "585.5":  "chronic kidney disease stage V",
    "585.6":  "end stage renal disease",
    "586":    "renal failure unspecified",
    "486":    "pneumonia organism unspecified",
    "491":    "chronic bronchitis",
    "492":    "emphysema",
    "493":    "asthma",
    "496":    "chronic obstructive pulmonary disease",
    "518":    "other diseases of lung",
    "518.0":  "pulmonary collapse atelectasis",
    "518.81": "acute respiratory failure",
    "272":    "disorders of lipoid metabolism hyperlipidaemia",
    "272.0":  "pure hypercholesterolaemia",
    "272.4":  "hyperlipidaemia mixed",
    "276":    "fluid electrolyte acid base disorder",
    "276.1":  "hyponatraemia electrolyte imbalance",
    "276.5":  "volume depletion dehydration",
    "285":    "anaemia",
    "285.9":  "anaemia unspecified",
    "285.1":  "anaemia in neoplastic disease",
    "157":    "malignant neoplasm pancreas",
    "197":    "secondary malignant neoplasm respiratory digestive",
    "V45":    "postprocedural states",
    "V45.81": "aortocoronary bypass status post cardiac surgery",
    "V58":    "aftercare encounter",
    "V58.67": "long term insulin use",
    "V10":    "personal history malignant neoplasm",
    "780":    "general symptoms fever malaise",
    "786":    "respiratory symptoms chest pain",
    "786.5":  "chest pain unspecified",
    "789":    "abdominal pain",
    "v":      "aftercare encounter",
}


def icd9_lookup(code: str) -> str:
    """
    Return the clinical English description for an ICD-9 code.
    Two-layer fallback: icd9cms library → hand-curated dict → prefix match.
    """
    code = str(code).strip()
    if code in ("nan", "", "None"):
        return ""

    # Layer 1: icd9cms library (~14 000 codes)
    try:
        import icd9cms  # type: ignore
        result = icd9cms.search(code)
        if result:
            return result.long_desc.lower()
    except Exception:
        pass

    # Layer 2: hand-curated dictionary
    if code in ICD9_CLINICAL_DICT:
        return ICD9_CLINICAL_DICT[code]

    # Layer 3: prefix match (longest-first)
    for length in (5, 4, 3, 1):
        prefix = code[:length]
        if prefix in ICD9_CLINICAL_DICT:
            return ICD9_CLINICAL_DICT[prefix]

    return f"Unknown code ({code})"  # fall back with user-friendly label
