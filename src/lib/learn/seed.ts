// The FynoLabs starter courses for Learn (/admin/learn: "Add the FynoLabs starter courses").
// Every fact here comes from FynoLabs's own material: the three booklets (AI Training/Outreach kit),
// the videos' upload notes (AI Training/Social/Series/<name>/YouTube.md, and the RL video's post copy
// and captions), the playbook series notes and the AI Trainer Quiz (Company/Design scripts/fun_shorts.py).
// Videos aren't on YouTube yet, so their url is null: the lesson shows "Video coming soon" and the notes.
// Adding them only inserts what's missing (by course slug, then lesson title); edits are never overwritten.
import type { QuizQuestion } from "@/db/schema";
import type { CourseKind, CourseLevel, LessonKind } from "@/lib/constants";
import type { ArtKey } from "./labels";

export type SeedLesson = { title: string; kind: LessonKind; url?: string | null; body?: string | null; quiz?: QuizQuestion[] | null; minutes?: number | null };
export type SeedCourse = { slug: string; title: string; summary: string; kind: CourseKind; level: CourseLevel; art: ArtKey; minutes?: number | null; position: number; lessons: SeedLesson[] };

const q = (question: string, options: string[], answer: number, why: string): QuizQuestion => ({ q: question, options, answer, why });

// ---------- Booklet: the benchmark task playbook ----------

const PLAYBOOK_NOTES = `How we build the tasks that train and test frontier AI. 26 pages, one idea per page.

## Inside

- Foundations: what a task is, and the five properties every task must have
- 01 Coding-agent benchmarks
- 02 Research reproduction
- 03 Model evaluation & RLHF
- 04 Long-horizon agent tasks
- 05 STEM & expert reasoning
- Quality and metrics
- For writers and buyers

For each task type: what it measures, how it's built and how we check it before it ships.

Every example was written for this playbook. None comes from a client task.`;

// ---------- Terminal-Bench from zero ----------

const TB_VIDEO_NOTES = `New to AI training work? This calm, illustrated guide takes you from "what is AI data?" to how Terminal-Bench tasks are built, checked and made cheat-proof. No background needed.

## You'll learn

- What a benchmark is, and why test data stays separate
- How AI agents work in a terminal, and how they're tested
- Terminal-Bench 2.0 vs 3.0: why scores dropped from ~80% to about a third
- The five parts of every task: instruction, settings, environment, solution (the oracle), tests
- Docker, Harbor and pytest, explained simply
- A real task, live: five hidden bugs in a revenue report
- How to make a task hard but fair, and how cheating agents are stopped

## Chapters

- 0:00 Welcome
- 0:28 The world of AI data
- 1:51 Agents
- 2:53 Terminal-Bench
- 4:00 Inside a task
- 5:39 Your toolkit
- 6:45 A real task, live
- 8:36 Hard, but fair
- 9:28 Cheat-proof
- 10:42 Think like a reviewer

Sources: tbench.ai (Terminal-Bench 3.0 announcement), Harbor documentation. The sample task is our own, written for teaching.`;

const TB_BOOKLET_NOTES = `From "what is AI data?" to writing tasks that frontier agents fail, in nine steps. One idea per page: read the headline, look at the drawing, read the one line under it.

1. The world: AI data and benchmarks
2. Agents: models that act
3. Terminal-Bench: what it is, why it's hard
4. Anatomy: the five files of a task
5. Toolkit: Docker, Harbor, pytest
6. First task: build one, line by line
7. Hard, fairly: real difficulty
8. Cheat-proof: stop agents gaming it
9. Expertise: review like a pro`;

const TB_QUIZ: QuizQuestion[] = [
  q(
    "What does a task's instruction.md say?",
    ["The goal, the rules and the time limit, never the method", "The goal and the exact commands that fix it", "Only the time limit"],
    0,
    "Say what, never how. If the instruction gives away the method, the task measures reading, not skill.",
  ),
  q(
    "What must never be copied into the task's Docker image?",
    ["The app, in its broken state", "The tools, at pinned versions", "tests/ and solution/"],
    2,
    "The agent would read the answers. Never COPY tests/ or solution/ into the image.",
  ),
  q(
    "When and where do the tests run?",
    ["While the agent works, inside its own machine", "After the agent stops, on a separate verifier machine", "Before the agent starts, to check the machine builds"],
    1,
    "Tests run after the agent stops, on what it left behind. In Terminal-Bench 3.0 the results are copied to a separate verifier machine, so the agent can't touch the grader.",
  ),
  q(
    "Your task is ready to ship when...",
    ["Your solution passes once", "Your solution passes every run, doing nothing fails, and the lazy shortcut fails", "A strong agent passes every run"],
    1,
    "Three runs, three answers: your oracle passes every time, doing nothing fails, the lazy shortcut fails.",
  ),
  q(
    "Which of these is real difficulty?",
    ["Tricky wording", "A too-tight timer", "Messy, realistic state"],
    2,
    "Difficulty should come from skill an expert has, never from tricks. Tricky wording and a too-tight timer are fake difficulty.",
  ),
];

// ---------- PaperBench from zero ----------

const PB_VIDEO_NOTES = `Can an AI agent read a research paper and rebuild its results from scratch? That's what OpenAI's PaperBench measures. This calm, illustrated guide takes you from "what is AI data?" to how PaperBench rubrics are built, graded and written well. No background needed.

## You'll learn

- What a benchmark is, and what research agents do
- PaperBench in numbers: 20 ICML 2024 papers, 8,316 graded requirements
- How agents score, and how they compare with ML PhDs
- What's in a paper's folder: addendum, blacklist, rubric, reproduce.sh
- The rubric tree: three kinds of leaf, weights, and how scores roll up
- How grading works: the fresh re-run and the AI judge
- A worked example: writing your first rubric
- What makes a good leaf, and how cheating is blocked

## Chapters

- 0:00 Welcome
- 0:27 The world of AI data
- 1:11 Research agents
- 2:24 PaperBench
- 4:19 Inside a paper
- 5:29 The rubric
- 6:48 How it's graded
- 8:20 Your first rubric
- 9:44 Good leaves
- 10:59 Think like a reviewer

Sources: Starace et al., "PaperBench: Evaluating AI's Ability to Replicate AI Research" (OpenAI, 2025, arXiv 2504.01848) and OpenAI's public code (github.com/openai/frontier-evals). The warmup paper is our own example, written for teaching.`;

const PB_BOOKLET_NOTES = `From "what is AI data?" to writing rubrics that grade an AI's research, in nine steps. One idea per page: read the headline, look at the drawing, read the one line under it.

1. The world: AI data and benchmarks
2. Research agents: models that do research
3. PaperBench: what it is, why it's hard
4. Anatomy: a paper's folder
5. The rubric: trees, leaves and weights
6. Grading: fresh runs and the judge
7. First rubric: build one, branch by branch
8. Good leaves: fair, precise, cheat-proof
9. Expertise: review like a pro`;

const PB_QUIZ: QuizQuestion[] = [
  q(
    "What may the agent not use when it replicates a paper?",
    ["The paper and the authors' clarifications (the addendum)", "The paper's own code repository, or any online replication of it", "The open web"],
    1,
    "The agent may browse, but blacklist.txt rules out the paper's own repository and any online replication of it. It works from the paper, the addendum and the open web, like a new PhD student would.",
  ),
  q(
    "Which kind of leaf asks: did it actually run?",
    ["Code Development", "Execution", "Result Match"],
    1,
    "Code Development asks if it's written correctly, Execution if it actually ran, Result Match if the results match the paper.",
  ),
  q(
    "What does a node's weight say?",
    ["How hard that part was to build", "How much it matters next to its siblings"],
    1,
    "Importance, not effort. Ask: if this were missing, would the paper's main claim still stand? If not, weight it up.",
  ),
  q(
    'A result leaf reads: "Figure 2 has been reproduced and looks the same." What\'s wrong with it?',
    ["Nothing, it's a good leaf", "The judge can't see images: results must land in text, like logs, CSV or JSON files", "It should demand the paper's exact numbers"],
    1,
    "The judge never opens images. Ask for evidence that lands in text the judge can read.",
  ),
  q(
    "The paper reports 93.7% accuracy. How should a Result Match leaf put it?",
    ["Accuracy is exactly 93.7%", "Accuracy is around 93.7% (within 0.5)", "Leave the number out and check the code instead"],
    1,
    "Training is noisy, so honest replications land near the paper, not on it. A leaf that demands exactly 93.7% would fail honest replications.",
  ),
];

// ---------- ML benchmark tasks from zero ----------

const ML_VIDEO_NOTES = `How do you test whether an AI agent can do real machine learning work: clean messy data, train a model, and hit a target? This calm, illustrated guide explains how ML benchmark tasks are built so they're hard, fair and cheat-proof. No benchmark background needed.

## You'll learn

- What an ML benchmark task is, and the public benchmarks that use them
- The five parts: environment, instruction, oracle, verifier, baseline
- Real, licensed data, hidden test labels, and the leakage trap
- Writing an instruction that says what, never how
- Setting a fair pass bar, and handling run-to-run randomness
- Real difficulty vs tricks, and how agents game ML metrics
- A six-point checklist before you ship

## Chapters

- 0:00 Welcome
- 0:27 Why ML tasks
- 1:23 Anatomy
- 2:01 The data
- 2:59 The instruction
- 3:32 Verifier and thresholds
- 4:29 Hard, but fair
- 5:08 Cheat-proof
- 6:12 Ship it

## In short

- **The pass bar:** below your oracle's worst run, above every weak baseline. The same code scores differently each run.
- **The leakage trap:** same patient in train and test? Your score is lying. Split by the real structure.

Public benchmarks mentioned: MLE-bench, RE-Bench, PaperBench, Terminal-Bench. Numbers in the threshold examples are illustrative.`;

const ML_QUIZ: QuizQuestion[] = [
  q(
    "An ML benchmark task has five parts: environment, instruction, oracle, verifier and...",
    ["A baseline", "A leaderboard", "A hint file"],
    0,
    "The five parts are environment, instruction, oracle, verifier and baseline.",
  ),
  q(
    "What should the instruction say?",
    ["What to achieve, never how", "The exact model and settings to use"],
    0,
    "Write an instruction that says what, never how.",
  ),
  q(
    "Where should the test labels be?",
    ["Hidden from the agent", "Next to the training data, so the agent can check itself"],
    0,
    "Real, licensed data, with the test labels hidden.",
  ),
  q(
    "The same patient is in both the training and the test data. What's the problem?",
    ["Nothing, more data is better", "Leakage: the score is lying"],
    1,
    "Same patient in train and test? Your score is lying. Split by the real structure.",
  ),
  q(
    "Where do you set the pass bar for an ML task?",
    ["Exactly at your oracle's best run", "Below your oracle's worst run, above every weak baseline"],
    1,
    "Below your oracle's worst run, above every weak baseline. And remember: the same code scores differently each run.",
  ),
];

// ---------- RL environments and harnesses ----------

const RL_VIDEO_NOTES = `Two words come up in every AI training job: RL environment, and harness. This short explainer shows what each one is, how they fit together, and why a model will exploit whichever one is weaker.

- **The environment** is the problem and its reward: a starting state, a goal, the actions a model can take, and tests that decide a 1 or a 0.
- **The harness** is the runner: it starts the container, hands the model the task, runs every command, enforces limits, grades the result and records the transcript.

Think of an exam: the environment is the paper, the harness is the exam hall, the clock and the invigilator.

## Chapters

- 0:00 Welcome
- 0:21 The loop: try, score, get better
- 0:46 The environment
- 1:10 A real one: a repo with a silent bug
- 1:39 The harness
- 2:07 Side by side: the paper and the exam hall
- 2:30 Where it breaks
- 3:07 The checks to run before a task ships
- 3:36 In one line

## Before a task ships, check both

- An agent that does nothing scores 0
- A faked success scores 0
- The grader is out of the agent's reach
- The reference solution passes 10 out of 10
- A second, different fix also passes
- Test inputs are generated at grading time

Own both. A model will find the weaker one.`;

const RL_QUIZ: QuizQuestion[] = [
  q(
    "Which one is the RL environment?",
    ["The problem and its reward: a starting state, a goal, the actions a model can take, and tests that decide a 1 or a 0", "The runner that starts the container, runs every command and records the transcript"],
    0,
    "The environment is the problem and its reward. The runner is the harness.",
  ),
  q(
    "Think of an exam. What is the harness?",
    ["The exam paper", "The exam hall, the clock and the invigilator"],
    1,
    "The environment is the paper. The harness is the hall, the clock and the invigilator.",
  ),
  q(
    "Which of these is a harness hole?",
    ["Tests the agent can read", "An agent that exits early and still gets counted as a success"],
    1,
    "Readable tests are an environment hole. Harness holes: an agent that edits the grader, prints \"tests passed\", or exits early and gets counted as a success.",
  ),
  q(
    "Before a task ships, what should an agent that does nothing score?",
    ["0", "1"],
    0,
    "An agent that does nothing must score 0, and so must a faked success. The grader must be out of the agent's reach.",
  ),
  q(
    "Your reference solution passes, but a second, different correct fix fails. What does that tell you?",
    ["The second fix is wrong", "The problem is in your harness or your tests, not the model"],
    1,
    "A second, different correct fix should still pass. If it doesn't, the problem is in your harness or your tests, not the model.",
  ),
];

// ---------- How we deliver quality ----------

const QUALITY_VIDEO_NOTES = `How do you keep quality high when an AI-training team grows fast? This calm, illustrated walkthrough shows the managed-team workflow FynoLabs uses: three review levels, blind and random assignment, planted checks, lead audits, and a score tied to accepted work.

## You'll see

- Why friendly reviewers approve weak work, and why more reviewers won't fix it
- R1 reviewers, R2 leads and an R3 final lead
- Blind, random assignment across groups
- Planted errors that keep every reviewer honest
- Lead audits of a random sample
- Scoring reviewers on what the client accepts
- Our record, and how a small pilot works

## Chapters

- 0:00 Welcome
- 0:25 The problem
- 0:45 Three levels
- 1:07 Blind and random
- 1:22 Planted checks
- 1:38 Audits
- 1:56 Scored on accepted work
- 2:12 The record
- 2:30 Start with a pilot
- 2:53 Thank you

## In short

- Reviewers get friendly with authors, and errors reach the client. The fix is structure: three levels of review.
- Reviewers see a task number, never the author, and get tasks from another group.
- Hidden known errors and random lead audits show who really checks.
- Approvals don't count. Accepted work does.`;

const QUALITY_QUIZ: QuizQuestion[] = [
  q(
    "Reviewers get friendly with authors, and weak work gets through. What fixes it?",
    ["More reviewers", "Structure: three levels of review"],
    1,
    "More reviewers won't fix it. Structure does: R1 reviewers, R2 leads and an R3 final lead.",
  ),
  q(
    "In blind review, what does a reviewer see?",
    ["The author's name", "A task number, never the author"],
    1,
    "Reviewers see a task number, never the author, and get tasks from another group.",
  ),
  q("What are planted errors for?", ["To slow reviewers down", "To show who really checks"], 1, "Hidden known errors and random lead audits show who really checks."),
  q("What are reviewers scored on?", ["How many tasks they approve", "What the client accepts"], 1, "Approvals don't count. Accepted work does."),
];

// ---------- AI Trainer Quiz (the daily YouTube Shorts) ----------

/** [question, answer A, answer B, correct, why, takeaway], in the Shorts' order (fun_shorts.py, list Q). */
type Short = [string, string, string, "A" | "B", string, string];
const SHORTS: Short[] = [
  ["A reviewer has to check your answer. Which one passes?", '"About 6.5"', '"6.57, within ±0.05"', "B", 'A reviewer can only accept what they can verify. "About" can\'t be checked.', "Make every answer checkable."],
  ["An AI data partner wants to test a new team. What should they send first?", "A 200-task batch", "One task and its rubric", "B", "Score one task against your own bar before you commit to volume.", "Pilot first. Scale later."],
  ["Same budget. Who gives you better data?", "Ten fast skimmers", "One expert who checks every number", "B", "Ten people skimming make ten times the rework. Quality is a people problem.", "Fewer people. Better data."],
  ["The agent wrote the code and it runs. Has it reproduced the paper?", "Yes, it runs", "Not until the results match", "B", "Code written and code running are steps one and two. The results matching, within a tolerance, is step three.", "Running isn't reproducing."],
  ["You're reviewing an AI-trainer application. Which one is the red flag?", "CV and LinkedIn dates don't match", "Lists the tools they really use", "A", "Mismatched profiles get whole teams banned. Make your CV and LinkedIn say exactly the same thing.", "Match your CV and LinkedIn."],
  ['"Explains the method well." Is that a good rubric line?', "Yes, it's clear", "No, it's too vague", "B", "Two reviewers will score it differently. Try: names the method and says why it fits this data.", "Write lines strangers score the same."],
  ["You open a fresh set of guidelines. What do you mark first?", "Every must and every never", "The formatting tips", "A", "Most rejections trace back to one must or never you skimmed.", "Hunt the musts and nevers."],
  ["One guideline line confuses you. When do you ask about it?", "After my first rejection", "Before task one", "B", "A question costs one message. A rejection costs your acceptance rate.", "Ask before, not after."],
  ["An expert leaves mid-project. What should a good vendor do?", "Send you a new CV", "Bring in someone vetted and briefed", "B", "You shouldn't run a hiring process. The replacement should arrive trained on your guidelines.", "Replacements, handled."],
  ["True or false: doing more tasks is the fastest way to get better.", "True", "False", "B", "Volume repeats your mistakes. A rejection with a reason fixes them.", "Feedback is the real level-up."],
  ["Work is quiet this week. What's the best use of the time?", "Write three practice tasks with rubrics", "Wait for the queues to fill", "A", "Three practice tasks with rubrics will lift your acceptance rate for the whole next quarter.", "Use quiet weeks to level up."],
  ["Which task is hard but fair?", "Tricky wording that hides the ask", "Two easy steps combined, with real data", "B", "Trick wording is unfair and gets rejected. Real difficulty comes from combining steps a model handles alone.", "Hard, but fair."],
  ["True or false: if a model gets your question right, it's a great question.", "True", "False", "B", "If today's model already gets it right, the task teaches it nothing. Make it harder, fairly.", "Test it on a model first."],
  // The Short says "Only paid hours / Paid and unpaid hours ... your real rate"; worded without pay for the portal.
  ["Setting up your year. What should your hours tracker count?", "Only the hours on tasks", "Every hour, on tasks or not", "B", "Onboarding, tests and rework take time too. Count them, or you'll never know where your time goes.", "Track every hour."],
  ["The answer to your question is on the first page of Google. What now?", "Rewrite it with new numbers", "Submit it anyway", "A", "If the answer is online, a model has seen it. Then you're testing memory, not reasoning.", "Search-proof every question."],
  ["Staffing an AI data project. What takes longest?", "Finding CVs", "Screening, briefing and calibration", "B", "CVs are quick. Screening, briefing on your guidelines and getting reviewers to agree take the time.", "Start your pilot early."],
  ["Labs want better models. What's in short supply?", "Compute", "Expert judgement", "B", "Compute gets cheaper every year. Someone who knows the field and checks every number doesn't.", "Judgement is the bottleneck."],
  ["What's the number one rule of AI-training work?", "Read the rubric like a contract", "Work as fast as you can", "A", "Speed doesn't matter. Acceptance does. And acceptance starts with the rubric.", "Read it like a contract."],
  ["Which resolution will help an AI trainer most this year?", "More tasks per hour", "A higher acceptance rate", "B", "Accepted work leads to better projects. Fast, rejected work leads nowhere.", "Aim for acceptance."],
  ["Answer A is long and fluent. Answer B is short and correct. Which wins?", "A, it sounds better", "B, it's correct", "B", "The costliest label in RLHF is a fluent wrong answer marked better. Check the facts, run the code.", "Never trust fluent."],
  // The Short's other option is "How much you earned"; worded without pay for the portal.
  ["Fifteen minutes on Sunday. What should you review?", "Every rejection, and its reason", "How many tasks you did", "A", "Each reason you understand is a mistake you'll never make again.", "Review rejections weekly."],
  ["Two reviewers score the same answer a 2 and a 4. What next?", "Average it to a 3", "Find the rubric line they read differently", "B", "Averaging hides the problem. Disagreement means the rubric is ambiguous.", "Ambiguity is a document bug."],
  ["You need an expert for a finance task. What's the best signal?", "An impressive job title", "A trial task on your own rubric", "B", "Titles don't predict accepted work. A trial in your format does.", "Trust trials, not titles."],
  ["New project. Twenty experts are ready. What's your first move?", "Start everyone at once", "Start a few, double-review, then scale", "B", "Twenty people misreading one guideline means twenty times the rework.", "Start slow to go fast."],
  ['A coding-agent test checks the printed message "Done!". Good test?', "Yes", "No", "B", 'An agent can print "Done!" without doing anything. Check the end state: files, databases, services.', "Test state, not output."],
  ["You're applying for an AI-training role. What's the biggest mistake?", "Applying when you don't meet the bar", "Tailoring your profile to the role", "A", "Unqualified applications waste your test attempts and can get accounts flagged.", "Apply where you qualify."],
  ["True or false: an AI-written answer is fine if you edit it a bit.", "True", "False", "B", "The work exists to show a model what it can't do. Detection is routine, and it's one strike.", "Your reasoning is the product."],
  ["Your first task on a new project. Fast or slow?", "Fast, to look productive", "Slow, then self-review", "B", "Your first five tasks set your reputation on the project. Read the feedback before task two.", "First tasks, slow tasks."],
  ["The reference solution passed 9 out of 10 runs. Ship the task?", "Yes, 90% is great", "No, it must pass 10 out of 10", "B", "A flaky task punishes good agents at random. Fix it until the reference passes every time.", "Flaky tasks don't ship."],
  ["Where should a partner's tasks live?", "A shared personal Drive folder", "In their tool, open only to project experts", "B", "NDAs both ways, least access, and access removed the day someone leaves.", "Your data, your rules."],
];

const shortQuestion = ([question, a, b, correct, why, takeaway]: Short): QuizQuestion => q(question, [a, b], correct === "A" ? 0 : 1, `${why} ${takeaway}`);
const round = (n: number): SeedLesson => ({ title: `Round ${n}`, kind: "quiz", minutes: 5, quiz: SHORTS.slice((n - 1) * 10, n * 10).map(shortQuestion) });

// ---------- The list ----------

export const STARTER_COURSES: SeedCourse[] = [
  {
    slug: "benchmark-task-playbook",
    title: "Benchmark task playbook",
    summary: "How we build the tasks that train and test frontier AI. Five task types: what each measures, how it's built and how we check it before it ships.",
    kind: "guide",
    level: "beginner",
    art: "booklet",
    position: 10,
    lessons: [{ title: "The playbook", kind: "pdf", url: "/learn/fynolabs-benchmark-playbook.pdf", body: PLAYBOOK_NOTES, minutes: 15 }],
  },
  {
    slug: "terminal-bench-from-zero",
    title: "Terminal-Bench from zero",
    summary: 'From "what is AI data?" to writing terminal tasks that frontier agents fail. A video, a nine-step booklet and a short quiz.',
    kind: "course",
    level: "beginner",
    art: "terminal",
    position: 20,
    lessons: [
      { title: "How Terminal-Bench tasks are built", kind: "video", url: null, body: TB_VIDEO_NOTES, minutes: 12 },
      { title: "The illustrated booklet", kind: "pdf", url: "/learn/terminal-bench-from-zero.pdf", body: TB_BOOKLET_NOTES, minutes: 25 },
      { title: "Check what you know", kind: "quiz", quiz: TB_QUIZ, minutes: 5 },
    ],
  },
  {
    slug: "paperbench-from-zero",
    title: "PaperBench from zero",
    summary: 'From "what is AI data?" to writing rubrics that grade an AI\'s research. A video, a nine-step booklet and a short quiz.',
    kind: "course",
    level: "beginner",
    art: "rubric",
    position: 30,
    lessons: [
      { title: "How PaperBench rubrics work", kind: "video", url: null, body: PB_VIDEO_NOTES, minutes: 12 },
      { title: "The illustrated booklet", kind: "pdf", url: "/learn/paperbench-from-zero.pdf", body: PB_BOOKLET_NOTES, minutes: 30 },
      { title: "Check what you know", kind: "quiz", quiz: PB_QUIZ, minutes: 5 },
    ],
  },
  {
    slug: "ml-benchmark-tasks-from-zero",
    title: "ML benchmark tasks from zero",
    summary: "How to test whether an AI agent can do real machine learning work, and how to build those tasks so they're hard, fair and cheat-proof.",
    kind: "course",
    level: "intermediate",
    art: "ml",
    position: 40,
    lessons: [
      { title: "How ML benchmark tasks are built", kind: "video", url: null, body: ML_VIDEO_NOTES, minutes: 7 },
      { title: "Check what you know", kind: "quiz", quiz: ML_QUIZ, minutes: 4 },
    ],
  },
  {
    slug: "rl-environments-and-harnesses",
    title: "RL environments and harnesses",
    summary: "Two words in every AI training job. What each one is, how they fit together, and why a model will exploit whichever one is weaker.",
    kind: "course",
    level: "beginner",
    art: "loop",
    position: 50,
    lessons: [
      { title: "Environment vs harness", kind: "video", url: null, body: RL_VIDEO_NOTES, minutes: 4 },
      { title: "Check what you know", kind: "quiz", quiz: RL_QUIZ, minutes: 4 },
    ],
  },
  {
    slug: "how-we-deliver-quality",
    title: "How we deliver quality",
    summary: "How we keep quality high as a team grows: three review levels, blind and random assignment, planted checks, lead audits and scoring on accepted work.",
    kind: "course",
    level: "beginner",
    art: "review",
    position: 60,
    lessons: [
      { title: "Our quality workflow", kind: "video", url: null, body: QUALITY_VIDEO_NOTES, minutes: 3 },
      { title: "Check what you know", kind: "quiz", quiz: QUALITY_QUIZ, minutes: 3 },
    ],
  },
  {
    slug: "ai-trainer-quiz",
    title: "AI Trainer Quiz",
    summary: "Thirty quick questions on doing AI-training work well, in three rounds of ten. Pick A or B, then see why.",
    kind: "quiz",
    level: "beginner",
    art: "quiz",
    position: 70,
    lessons: [round(1), round(2), round(3)],
  },
];
