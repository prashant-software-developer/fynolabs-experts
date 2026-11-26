// The two documents every expert signs in the portal (Prashant, 26 Nov 2026: "wording like this,
// legally", modelled on the click-through NDA and data agreement AI data platforms use). Written
// for FynoLabs: Shakshi Patel, sole proprietor, trading as FynoLabs, under Indian law with Lucknow
// as the seat. No GSTIN or street address here (those stay in Company/Legal/Registration). The
// expert is identified by the details filled in when they sign: {{full_name}}, {{email}},
// {{country}}, {{date}}. Body format: one paragraph per line, "# " a heading, "1.1<tab>" a clause.
// Draft for review by a lawyer before experts rely on it.

export type DefaultDocument = { title: string; kind: "nda" | "agreement" | "compliance" | "other"; position: number; description: string; body: string };

const PARTY = "Shakshi Patel, sole proprietor, carrying on business under the trade name FynoLabs, Lucknow, Uttar Pradesh, India (website fynolabs.si, email hello@fynolabs.si) (“FynoLabs”)";

const NDA = [
  "# Non-Disclosure Agreement",
  `This Non-Disclosure Agreement (the “Agreement”) takes effect on the date it is signed electronically below (the “Effective Date”) between ${PARTY} and the individual named in the signature block below (the “Contractor”).`,
  "FynoLabs finds experts for AI training, evaluation, data and related projects run for its clients, which include AI research labs and AI data companies (each a “Client”). To do this work the Contractor will receive information that must stay private (the “Purpose”). In return for that access, the Contractor agrees as follows.",
  "# 1. Confidential Information",
  "1.1\t“Confidential Information” means all non-public information the Contractor receives or creates in connection with the Purpose, in any form, that is marked confidential or that a reasonable person would understand to be confidential.",
  "1.2\tIt includes in particular: the identity of Clients and the names or codenames of their projects; tasks, prompts, model outputs, guidelines, rubrics, reviews and feedback; datasets, code, tools and evaluation results; and FynoLabs’s rates, terms and business information.",
  "1.3\tMuch of the Confidential Information belongs to Clients. Each Client may rely on this Agreement as if it were a party to it.",
  "# 2. What the Contractor must do",
  "2.1\tKeep all Confidential Information strictly confidential and not disclose it to anyone without FynoLabs’s prior written consent.",
  "2.2\tUse Confidential Information only for the Purpose, and only on the platforms, accounts and tools FynoLabs or the Client approves.",
  "2.3\tNot enter any task, prompt, guideline or model output into an AI tool, chatbot or online service that the project has not approved, and not share it in any community, forum or social media post.",
  "2.4\tNot copy, screenshot, record or keep Confidential Information except as the work requires.",
  "2.5\tProtect Confidential Information with at least reasonable care, and tell FynoLabs at hello@fynolabs.si as soon as possible about any loss or unauthorised use or disclosure.",
  "2.6\tFollow any confidentiality, security or platform terms a Client sets for its project, as well as this Agreement.",
  "# 3. What is not confidential",
  "3.1\tThe obligations in clause 2 do not cover information that (a) is or becomes public through no fault of the Contractor; (b) the Contractor already knew, without restriction, before receiving it; (c) the Contractor lawfully receives from someone free to share it; or (d) the Contractor develops independently without using Confidential Information.",
  "3.2\tIf the law or a court or authority requires the Contractor to disclose Confidential Information, the Contractor may disclose only what is required and will, where allowed, tell FynoLabs promptly beforehand so that FynoLabs or the Client can seek protection.",
  "# 4. Ownership",
  "4.1\tConfidential Information stays the property of FynoLabs or the Client. This Agreement gives the Contractor no licence or other right in it, except to use it for the Purpose. It is provided as is, without any warranty.",
  "# 5. Returning information",
  "5.1\tWhen a project ends, or whenever FynoLabs asks, the Contractor will return or delete all Confidential Information, including copies and notes, and confirm this in writing if asked.",
  "# 6. Term",
  "6.1\tThis Agreement continues until either party ends it by 30 days’ written notice (email is enough). The Contractor’s obligations continue for five (5) years after it ends, and for as long as any trade secret or personal data remains confidential.",
  "# 7. Remedies",
  "7.1\tA breach of this Agreement may cause harm that money alone cannot put right, so FynoLabs and any Client may seek an injunction or other urgent relief, in addition to any other remedy. The Contractor is responsible for losses that FynoLabs or a Client suffers because of the Contractor’s breach.",
  "# 8. General",
  "8.1\tThis Agreement is personal to the Contractor, who may not assign or transfer it. FynoLabs may assign it to any successor to its business.",
  "8.2\tThis Agreement is governed by the laws of India. The parties will first try to settle any dispute by discussion within fifteen (15) days of notice. Any dispute not settled will be resolved by arbitration under the Arbitration and Conciliation Act, 1996 before a sole arbitrator appointed by agreement (or otherwise under that Act). The seat and venue of arbitration is Lucknow, Uttar Pradesh, and the language is English. Subject to that, the courts at Lucknow have exclusive jurisdiction; either party may seek urgent interim relief from any competent court.",
  "8.3\tThis Agreement, together with any engagement letter or contractor agreement between the parties, is the whole agreement on its subject. It may be changed only in writing accepted by both parties. If any part is unenforceable, the rest remains in force. A failure or delay in enforcing a right is not a waiver of it.",
  "8.4\tNotices may be sent by email to hello@fynolabs.si and to the Contractor’s email below. This Agreement may be signed electronically under the Information Technology Act, 2000, and that signature is as valid as a handwritten one.",
  "# Signatures",
  "For FynoLabs: Shakshi Patel, Proprietor",
  "Contractor: {{full_name}}",
  "Email: {{email}}",
  "Country: {{country}}",
  "Signed electronically on {{date}}",
].join("\n");

const DATA = [
  "# Data Submission and Ownership Agreement",
  `This Data Submission and Ownership Agreement (the “Agreement”) takes effect on the date it is signed electronically below between ${PARTY} and the individual named in the signature block below (the “Contractor”). It applies to everything the Contractor creates or submits for FynoLabs projects or through experts.fynolabs.si (the “Platform”).`,
  "# 1. Submissions",
  "1.1\t“Submissions” means all work the Contractor creates, writes, records or submits for a FynoLabs project or through the Platform, including tasks, prompts, questions, answers, solutions, code, tests, rubrics, reviews, ratings, annotations, documents, spreadsheets, models, audio, video and any other data or material, and any part or version of them.",
  "# 2. Ownership",
  "2.1\tThe Contractor assigns to FynoLabs, as each Submission is created, all right, title and interest in it worldwide, including all copyright, database rights and other intellectual property rights, for the full term of those rights and any renewal or extension. This assignment is in return for the fees agreed for the work; no other payment is due. It does not lapse if FynoLabs does not exercise the rights within one year.",
  "2.2\tWhere a right cannot be assigned, the Contractor grants FynoLabs an exclusive, worldwide, perpetual, irrevocable, royalty-free licence to use and exploit it in any way, with the right to transfer and sub-license it.",
  "2.3\tFynoLabs may transfer or license any of these rights to its Clients. Submissions are delivered to FynoLabs and its Clients only.",
  "2.4\tThe Contractor will sign any further document FynoLabs reasonably asks for to confirm or record these rights.",
  "# 3. Use of Submissions",
  "3.1\tFynoLabs and its Clients may use, copy, modify, combine, translate, publish, distribute, license and otherwise exploit Submissions for any purpose, including training, testing, evaluating and improving artificial intelligence models, by any means now known or developed later, without attribution to the Contractor and without further payment.",
  "3.2\tTo the extent the law allows, the Contractor waives, and agrees not to assert, any moral rights in Submissions (including the right to be named as the author and to object to changes), and consents to Submissions being used without attribution and in modified form.",
  "3.3\tFynoLabs is not obliged to use any Submission.",
  "# 4. The Contractor’s own materials",
  "4.1\tThe Contractor keeps the rights in material they owned before the work or create outside it. If the Contractor includes any such material in a Submission, the Contractor grants FynoLabs and its Clients a non-exclusive, worldwide, perpetual, irrevocable, royalty-free licence to use it as part of that Submission.",
  "# 5. Original and lawful work",
  "5.1\tThe Contractor confirms that each Submission: (a) is the Contractor’s own original work; (b) is not copied from any book, website, benchmark, dataset or other source, except as the project’s guidelines allow; (c) is not generated with an AI tool unless the project’s guidelines expressly allow it; (d) does not contain anyone else’s confidential information or trade secrets; (e) does not infringe anyone’s rights or break any law; and (f) contains no malicious code.",
  "5.2\tThe Contractor will not include personal data about any other person in a Submission unless the project asks for it and the Contractor has the right to provide it.",
  "# 6. Confidentiality",
  "6.1\tSubmissions, and the tasks and guidelines behind them, are Confidential Information under the Non-Disclosure Agreement between the parties. The Contractor will not keep, publish or reuse them, except as that agreement allows.",
  "# 7. The Contractor’s personal data",
  "7.1\tFynoLabs processes the Contractor’s own personal data (such as name, contact details and work records) to run the engagement, pay the Contractor and meet legal duties, in line with the Digital Personal Data Protection Act, 2023 and FynoLabs’s privacy notice. The Contractor can ask to see, correct or delete their data, or ask questions, at hello@fynolabs.si. FynoLabs may keep what the law requires it to keep, such as payment records.",
  "# 8. Responsibility",
  "8.1\tThe Contractor will indemnify FynoLabs and its Clients against losses, claims and reasonable costs (including legal fees) that arise from a breach of clause 5 or from the Contractor’s wilful misconduct.",
  "8.2\tApart from the payment terms agreed for the work, FynoLabs makes no promise about how or whether it uses Submissions.",
  "# 9. General",
  "9.1\tClauses 2 to 8 continue after this Agreement or the Contractor’s work ends.",
  "9.2\tThis Agreement is governed by the laws of India. Disputes are resolved as set out in the Non-Disclosure Agreement between the parties: discussion first, then arbitration with its seat in Lucknow, Uttar Pradesh, with the courts at Lucknow having exclusive jurisdiction subject to that.",
  "9.3\tThis Agreement, the Non-Disclosure Agreement and any engagement letter or contractor agreement between the parties are the whole agreement on their subjects. If they conflict on ownership of Submissions, this Agreement prevails. It may be changed only in writing accepted by both parties. If any part is unenforceable, the rest remains in force. This Agreement may be signed electronically under the Information Technology Act, 2000.",
  "# Signatures",
  "For FynoLabs: Shakshi Patel, Proprietor",
  "Contractor: {{full_name}}",
  "Email: {{email}}",
  "Country: {{country}}",
  "Signed electronically on {{date}}",
].join("\n");

export const DEFAULT_DOCUMENTS: DefaultDocument[] = [
  { title: "Non-Disclosure Agreement", kind: "nda", position: 0, description: "Keeps client work, tasks and data confidential. You sign it once.", body: NDA },
  { title: "Data Submission and Ownership Agreement", kind: "agreement", position: 1, description: "Who owns the work you submit, and how it may be used. You sign it once.", body: DATA },
];
