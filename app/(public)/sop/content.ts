// The full HR Standard Operating Procedure, expressed as structured data so
// the rendered page and the "Copy as Markdown" output stay in sync — both
// derive from SOP_SECTIONS below.

export type SopBlock =
  | { kind: "p"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "mistakes"; items: string[] }
  | { kind: "callout"; title?: string; text: string };

export type SopSection = {
  id: string;
  number: string;
  title: string;
  summary?: string;
  body: SopBlock[];
};

export const SOP_META = {
  title: "HR Standard Operating Procedure",
  subtitle:
    "Hotel Plus Recruiting Pipeline · Field manual for the talent team",
  lastUpdated: "2026-05-21",
};

export const SOP_INTRO: SopBlock = {
  kind: "callout",
  title: "How to ask an AI about this document",
  text:
    "If you want to ask an AI assistant questions about anything in this document — \"what does X do?\", \"what's the difference between Y and Z?\", \"give me the steps for ABC\" — click the Copy as Markdown button at the top of this page, paste the full text into a fresh Claude (or ChatGPT) chat, and then ask your question. Two prompt templates that work well: (1) \"Using only this document, answer: <your question>.\" — forces the AI to stay grounded in what's actually in the SOP. (2) \"Using only this document, give me the step-by-step procedure for <task>.\" — useful when you want a checklist for an unfamiliar workflow.",
};

export const SOP_SECTIONS: SopSection[] = [
  {
    id: "chapter-1",
    number: "1",
    title: "Welcome — what this tool does",
    summary:
      "A one-paragraph product overview, who it's for, and what it deliberately doesn't try to do.",
    body: [
      {
        kind: "p",
        text:
          "The Acquisition Pipeline is Hotel Plus's recruiting workstation. It pulls together the five things HR does every day — finding candidates, scoring them, tracking them through the funnel, scheduling interviews, and reaching out — into one screen.",
      },
      { kind: "h3", text: "Four pillars" },
      {
        kind: "ul",
        items: [
          "Source — bring candidates in from LinkedIn, JobsDB, pasted text, PDFs, screenshots, or your own bookmarklet.",
          "Score — let Claude (Anthropic's AI) read each candidate against a Job Description and return a numeric score with reasoning.",
          "Track — move candidates through the pipeline visually on a Kanban board, or as rows in a sortable table.",
          "Engage — schedule interviews on Google Calendar with one click; draft cold-outreach emails through Gmail with AI assistance and your review before sending.",
        ],
      },
      { kind: "h3", text: "Who it's for" },
      {
        kind: "p",
        text:
          "Full-time HR staff at Hotel Plus, plus hiring managers and panelists who need to read candidate profiles or join an interview. Everyone uses the same workspace and the same audit log.",
      },
      { kind: "h3", text: "What it doesn't do" },
      {
        kind: "p",
        text:
          "It is not a payroll system, not an offer-letter generator, and not an applicant tracking system in the regulatory sense. It does not store medical records or run background checks. Use your existing tools for those.",
      },
      { kind: "h3", text: "Why this exists" },
      {
        kind: "p",
        text:
          "In a fragmented workflow (LinkedIn → spreadsheet → Calendly → Gmail → another spreadsheet) candidates fall through the cracks and decisions get made on stale data. The Acquisition Pipeline keeps everything in one place with a full audit log so nothing gets lost and nothing happens without a paper trail.",
      },
      {
        kind: "mistakes",
        items: [
          "Treating the tool like a CV database. It is a workflow tool — the value is in the connected steps (sourcing → scoring → scheduling → emailing), not in storing CVs in isolation.",
          "Skipping the Job Description step. Almost every feature (scoring, cold email, interview prep) reads from the JD; without one, the AI has no rubric to work from.",
          "Editing candidate data in another tool first and then pasting in. Reverse the order — capture into the Acquisition Pipeline first, edit and enrich here.",
        ],
      },
    ],
  },

  {
    id: "chapter-2",
    number: "2",
    title: "Getting access",
    summary:
      "Two login paths, the four Google scopes the app requests and why, and what to do when Google shows the \"app not verified\" yellow screen.",
    body: [
      {
        kind: "p",
        text:
          "First-time access starts at the /login page. You have two ways in.",
      },
      { kind: "h3", text: "Path 1 — Sign in with Google (recommended)" },
      {
        kind: "p",
        text:
          "Click the Google button on the login form. Google asks you to consent to four scopes upfront. You can decline any scope you're not comfortable with — the corresponding feature will simply be greyed out until you sign back in and approve it.",
      },
      {
        kind: "table",
        headers: ["Scope", "Why we ask for it"],
        rows: [
          ["openid · email · profile", "Standard sign-in — identifies you to the app."],
          ["calendar.events", "Lets the app create, cancel, and reschedule interviews on your Google Calendar."],
          ["calendar.freebusy", "Lets the app warn you about scheduling conflicts before you book."],
          ["gmail.compose", "Lets the app save cold-email drafts into your Gmail Drafts folder."],
          ["gmail.send", "Lets the app send cold emails directly from your Gmail account."],
        ],
      },
      { kind: "h3", text: "Path 2 — Email one-time-code" },
      {
        kind: "p",
        text:
          "Type your work email, click Send code, check your inbox for a six-digit code (or click the magic link in the email), and you're in. This works without a Google account, but until you connect Google later in Settings, you won't be able to schedule interviews or send cold emails.",
      },
      { kind: "h3", text: "What happens on first login" },
      {
        kind: "p",
        text:
          "The system creates your user record automatically, attaches you to the Hotel Plus organisation, and lands you on /tracker — the Kanban board, which will be empty for now.",
      },
      { kind: "h3", text: "The \"app not verified\" warning" },
      {
        kind: "p",
        text:
          "If Google shows a yellow \"This app isn't verified\" warning during the review window: click Advanced → Go to Acquisition Pipeline (unsafe). The app is in Google's Testing mode (per Google's policy for non-public business apps), not actually unsafe — your account is on the explicit test-user list maintained by your administrator.",
      },
      {
        kind: "mistakes",
        items: [
          "Closing the browser before completing the Google consent screen. Half-consented scopes show as \"missing\" in Settings → Integrations and need a re-sign-in to fix.",
          "Using a personal Gmail account to test. The audit log will then attribute every action to your personal email. Always use your work email.",
          "Trying to sign in from a private/incognito window on first login. Google's consent screen sometimes refuses to open in incognito on slow networks — use a normal window first, then incognito is fine for re-visits.",
        ],
      },
    ],
  },

  {
    id: "chapter-3",
    number: "3",
    title: "Setting up your account",
    summary:
      "Settings → Integrations checklist, signature setup, and installing the one-click capture bookmarklet.",
    body: [
      {
        kind: "p",
        text:
          "Once you're in, finish setup at Settings → Integrations before you start working. The page shows a checklist of each integration, its current status, and what feature it unlocks.",
      },
      { kind: "h3", text: "Connect Google" },
      {
        kind: "p",
        text:
          "If you signed in with Google, this is already connected. If you signed in with the email code, scroll down and click Connect Google to add the scopes now. The page tells you exactly which scopes are missing so you can re-consent only to what's needed.",
      },
      { kind: "h3", text: "Paste your Apify API token" },
      {
        kind: "p",
        text:
          "Apify is the third-party scraper service that powers outbound LinkedIn search. Without a token, the Find candidates feature on the JD page is disabled. Get a free Apify account, copy your API token (a long string starting with apify_api_…), and paste it into the Apify field. Cost is pay-per-use, typically $0.01–$0.05 per LinkedIn profile depending on scraper mode.",
      },
      { kind: "h3", text: "Paste your Proxycurl API key (optional)" },
      {
        kind: "p",
        text:
          "Proxycurl is a different LinkedIn enrichment service used by the Scraper's Thirdparty tab. Only needed if you want to enrich LinkedIn URLs one at a time from the Scraper page. Most teams can skip this and rely on Apify (for outbound search) plus the bookmarklet (for one-off captures).",
      },
      { kind: "h3", text: "Set your email signature and From name" },
      {
        kind: "p",
        text:
          "At Settings → Email Composer, fill in two text fields. From name is the name candidates see in their inbox (e.g., \"Talent Team · Hotel Plus\"). Signature is appended to every cold email — plain text or simple HTML, including your name, role, company, and a way to reach you outside email.",
      },
      { kind: "h3", text: "Install the bookmarklet" },
      {
        kind: "p",
        text:
          "Go to Settings → Capture, click Generate bookmarklet once, then drag the yellow ➜ Send to Acquisition button to your browser's bookmarks bar. From now on, on any LinkedIn profile or JobsDB applicant page, click the bookmark and the page is captured into the app in a new tab.",
      },
      {
        kind: "mistakes",
        items: [
          "Forgetting to set a signature before sending cold emails. The system warns you; ignoring the warning means your emails go out without a sign-off.",
          "Pasting an Apify username instead of an API token. The token starts with apify_api_… — find it under Apify's Settings → Integrations.",
          "Treating the bookmarklet token as harmless. If your browser profile syncs to another device, anyone with the bookmark can post into your account. Regenerate the token to invalidate the old bookmark if you suspect leakage.",
        ],
      },
    ],
  },

  {
    id: "chapter-4",
    number: "4",
    title: "Writing a good Job Description",
    summary:
      "Every other feature reads from a JD. Field-by-field guidance, must-have vs. nice-to-have weighting, threshold tuning, and the per-JD scoring persona override.",
    body: [
      {
        kind: "p",
        text:
          "Every other feature in the app reads from a JD. Spending ten minutes here saves hours later.",
      },
      { kind: "h3", text: "Fields" },
      {
        kind: "ul",
        items: [
          "Title — exact role title (e.g., \"Senior Front Office Manager\", not \"Manager\"). Specific titles produce better LinkedIn searches.",
          "Department — used to group JDs on the list and feeds the cold-email AI's tone.",
          "Location — city / region / \"Remote (Thailand-based)\". Affects LinkedIn search filters and the candidate's expectations.",
          "Body / description — the full job spec, markdown or plain text. The AI reads this in full when scoring; the more honest and concrete it is, the better the scores.",
          "Must-haves — a short bulleted list (3–6 items) of non-negotiable requirements. Every item should be a real dealbreaker, not a wish.",
          "Nice-to-haves — softer signals. The AI weights these but doesn't penalise their absence.",
        ],
      },
      { kind: "h3", text: "Threshold guidance" },
      {
        kind: "p",
        text:
          "The threshold score is the cut-off where you'd consider a candidate worth reviewing. Use this as a sanity guide:",
      },
      {
        kind: "table",
        headers: ["Threshold", "Use case"],
        rows: [
          ["60–70", "Cast wide; you'll personally review most candidates."],
          ["75–85", "Standard quality bar; review at-threshold and above."],
          ["85+", "Rare-match role; expect few candidates to clear the bar."],
        ],
      },
      { kind: "h3", text: "The Advanced scoring persona override" },
      {
        kind: "p",
        text:
          "The Advanced — custom scoring persona section lets you override the org-wide scoring system prompt for this JD only. The default at /settings/prompts is tuned for general hospitality and corporate hiring. Override only when the role is genuinely unusual — for example, scoring an executive chef where culinary credentials matter more than years of tenure, or a creative role where portfolio thinking trumps title progression.",
      },
      { kind: "h3", text: "Editing a published JD" },
      {
        kind: "p",
        text:
          "Once a JD is published, past scores stay locked to the version they were scored against. If you edit the must-haves later, candidates already scored keep their original numbers; only fresh scores use the new rubric. This is intentional — it preserves the audit trail and prevents accidental rewriting of history.",
      },
      {
        kind: "mistakes",
        items: [
          "Bloating the must-have list. Six items max. If everything is a must-have, nothing is.",
          "Setting the threshold at 90 because \"we want the best.\" You'll filter out almost every viable candidate. Start at 75 and tighten only after you've seen the score distribution.",
          "Treating the persona override as the JD body. It is the scoring rubric persona, not the role description — it tells the AI how to judge, not what the role is.",
        ],
      },
    ],
  },

  {
    id: "chapter-5",
    number: "5",
    title: "Bringing candidates in — the five sources",
    summary:
      "The five Scraper tabs, the bookmarklet, and the outbound \"Find candidates\" search. Where each source lands on the Kanban.",
    body: [
      {
        kind: "p",
        text:
          "The app accepts candidates from six paths. Pick the one that matches the situation.",
      },
      { kind: "h3", text: "1. Paste — /scraper, Paste tab" },
      {
        kind: "p",
        text:
          "Copy a resume's text from anywhere — a Google Doc, a LinkedIn profile, an email — and paste it in. Claude Haiku 4.5 extracts structured fields (name, email, skills, experience, education) which you confirm or edit before saving. Use when you have the text but not a clean file.",
      },
      { kind: "h3", text: "2. URL — /scraper, URL tab" },
      {
        kind: "p",
        text:
          "Paste any public URL — a LinkedIn profile, a portfolio page, a job-board posting. The system fetches the page, falls back to Jina Reader if the initial fetch is blocked, then normalises the result. Use when you have a public link.",
      },
      { kind: "h3", text: "3. PDF — /scraper, PDF tab" },
      {
        kind: "p",
        text:
          "Upload a PDF resume. The file is saved first (so it stays available as an attachment even if parsing fails), then extracted with unpdf. Use this for resumes sent as attachments.",
      },
      { kind: "h3", text: "4. Screenshot — /scraper, Screenshot tab" },
      {
        kind: "p",
        text:
          "Upload an image — a screenshot of a candidate's LinkedIn page, a phone-camera photo of a printed CV, a Slack DM screenshot. Claude Opus 4.7 reads the image directly. Use when there's no text source, only pixels.",
      },
      { kind: "h3", text: "5. Thirdparty — /scraper, Thirdparty tab" },
      {
        kind: "p",
        text:
          "Paste a LinkedIn profile URL and the app calls Proxycurl to get the structured profile in one shot. Requires a Proxycurl key in Settings. Slower and pricier than the bookmarklet, but works without you being logged into LinkedIn.",
      },
      { kind: "h3", text: "6. Bookmarklet" },
      {
        kind: "p",
        text:
          "Installed once in Settings → Capture, then click on any LinkedIn or JobsDB page while you're logged in there. The page is captured using your own browser session (so private parts of LinkedIn profiles work), opened in a new tab at /bookmarklet-capture, parsed, and saved. This is the fastest single-candidate ingest path — about three seconds from click to saved record.",
      },
      { kind: "h3", text: "Outbound — Find candidates dialog" },
      {
        kind: "p",
        text:
          "For finding candidates you don't have yet, open any JD and click Find candidates for this JD (top-right). Choose your platforms (LinkedIn is supported; JobsDB / Indeed / Seek are marked coming soon), the count (5 to 50), and the scraper mode (Short = name + headline, cheapest; Full = + experience and education, moderate; Full + email = most expensive, includes email lookup). The dialog shows a live cost estimate. Click Run and watch the SSE stream: Claude derives a search query from the JD, LinkedIn returns matches, candidates are extracted, then each one is auto-scored against the JD. You can cancel mid-run.",
      },
      { kind: "h3", text: "Where each source lands" },
      {
        kind: "ul",
        items: [
          "Inbound (paste, URL, PDF, screenshot, thirdparty, bookmarklet) → \"Applied / Contacted\" stage by default.",
          "Outbound (Find candidates dialog) → \"Sourced\" stage by default.",
        ],
      },
      {
        kind: "p",
        text:
          "This split lets you see at a glance which candidates came to you vs. which you went out and got.",
      },
      {
        kind: "mistakes",
        items: [
          "Using the URL tab on a LinkedIn profile that requires login. LinkedIn blocks unauthenticated bots — the bookmarklet (which uses your logged-in session) is the right tool for that.",
          "Running Find candidates at Full + email mode for a 50-candidate fishing expedition. Cost adds up fast. Use Short to find shapes, then re-run Full + email on the few you want to contact.",
          "Saving a candidate without confirming the auto-extracted fields. Claude usually gets the name and email right, but always glance at the form before clicking Save.",
        ],
      },
    ],
  },

  {
    id: "chapter-6",
    number: "6",
    title: "Screening candidates with AI",
    summary:
      "/screener walkthrough: model and mode pickers, reading a score card, and why one candidate can have multiple scores against the same JD.",
    body: [
      {
        kind: "p",
        text:
          "Go to /screener to score a candidate against a JD. The page has two halves: pick the candidate and JD from searchable dropdowns on the left, then pick the model and mode on the right.",
      },
      { kind: "h3", text: "Model picker" },
      {
        kind: "ul",
        items: [
          "Claude Haiku 4.5 — fast, cheap (typically $0.005–$0.02 per score), good for high-volume initial screening.",
          "Claude Opus 4.7 — slower, costlier (typically $0.05–$0.20 per score), better reasoning for nuanced or senior roles.",
        ],
      },
      {
        kind: "p",
        text:
          "Default to Haiku. Reach for Opus only on senior roles where the difference in nuance is worth the spend.",
      },
      { kind: "h3", text: "Mode picker" },
      {
        kind: "ul",
        items: [
          "Single agent — one Claude pass, one score. Default.",
          "Team of 3 — three Claude agents run in parallel at slightly different temperatures, then a fourth (manager) agent reconciles their views. About four times the cost; useful when you have a borderline candidate and want a confidence check rather than a single shot.",
        ],
      },
      { kind: "h3", text: "Reading a score card" },
      {
        kind: "p",
        text:
          "Click Run score and watch the stream. The score card that appears contains:",
      },
      {
        kind: "ul",
        items: [
          "Weighted total — the headline score (0–100).",
          "Three sub-scores — Skills, Experience, Culture-fit. Weighted into the total.",
          "Strengths — what the candidate brings.",
          "Gaps — what they're missing relative to the JD.",
          "Prep questions — 4–6 interview questions tailored to the gaps. These flow through to the interviewer prep page later.",
          "Hiring report — short narrative summary of the recommendation.",
        ],
      },
      { kind: "h3", text: "Why a candidate can have multiple scores" },
      {
        kind: "p",
        text:
          "Below the stream is a collapsible history of every score this candidate has against the selected JD. One candidate can have multiple scores against the same JD because you re-ran them after editing the JD's must-haves or threshold. Both runs are kept — never overwritten — for the audit trail. The latest is auto-open; older ones are collapsed.",
      },
      { kind: "h3", text: "Cost transparency" },
      {
        kind: "p",
        text:
          "A cost estimate appears before you click Run. The actual cost — input tokens plus output tokens, converted to USD — appears on the completed score card.",
      },
      {
        kind: "mistakes",
        items: [
          "Running Team-of-3 on Opus for every candidate. You'll spend hundreds of dollars in a week. Use Single + Haiku for screening; reserve Team-of-3 for final-round borderline cases.",
          "Reading only the weighted total. A 78 from someone strong on Skills but weak on Culture-fit is a very different decision than a 78 from someone balanced across all three. Always glance at the sub-scores.",
          "Acting on prep questions without reading them. The AI sometimes generates a clunky or off-target question. Treat the list as a draft for the interviewer to edit.",
        ],
      },
    ],
  },

  {
    id: "chapter-7",
    number: "7",
    title: "Working the Tracker — Kanban + Table",
    summary:
      "The eight stages with explicit guidance on when to advance, the Kanban-vs-Table tradeoff, and why \"Applied / Contacted\" is one stage instead of two.",
    body: [
      {
        kind: "p",
        text:
          "/tracker is your daily home base. Every candidate appears as a card on the Kanban board, organised by stage.",
      },
      { kind: "h3", text: "The eight stages" },
      {
        kind: "table",
        headers: ["#", "Stage", "Move here when..."],
        rows: [
          ["1", "Sourced", "Outbound: you found them via Find candidates but haven't contacted yet."],
          ["2", "Applied / Contacted", "Inbound: they applied to you. Or outbound: you've sent your first cold email."],
          ["3", "Screening", "You've reviewed the AI score and decided to engage further."],
          ["4", "Prescreen Call", "A short qualifying phone or video call is scheduled or done."],
          ["5", "First Interview", "A formal interview is scheduled or done."],
          ["6", "Offer", "An offer letter is out."],
          ["7", "Hired", "They've accepted and joined."],
          ["8", "Rejected", "They're out — whether they declined or you passed."],
        ],
      },
      { kind: "h3", text: "Moving a candidate" },
      {
        kind: "p",
        text:
          "Drag the card horizontally onto the destination column. The change is saved immediately, logged to the audit feed, and shows an undo toast at the bottom of the screen for a few seconds. If you misdragged, click Undo and the card snaps back.",
      },
      { kind: "h3", text: "What each card shows" },
      {
        kind: "p",
        text:
          "Name, current title, JD it's assigned to, latest score colour-coded against the JD's threshold, and a source badge. Click the card to open the candidate detail page.",
      },
      { kind: "h3", text: "Kanban vs. Table" },
      {
        kind: "p",
        text:
          "Toggle between Kanban (visual workflow, best for daily standup) and Table (sortable rows, best for bulk review or filtering). Filter by JD with the dropdown at the top — when you're hiring for three roles at once, this is essential.",
      },
      { kind: "h3", text: "Why \"Applied / Contacted\" is one stage" },
      {
        kind: "p",
        text:
          "Inbound applicants and outbound candidates you've cold-emailed land in the same column. They are at the same point in your funnel — you have their attention, the next step is to qualify them — and there's no value in two separate columns. The source badge on the card disambiguates if you need to know.",
      },
      {
        kind: "mistakes",
        items: [
          "Treating drag-drop as a draft. Every move is logged immediately. If you misdrag, use the Undo toast (or /activity if you missed it) — don't \"drag back\" without undoing, because both moves show up in the audit log.",
          "Leaving candidates parked in Sourced. The Sourced column is staging, not storage. Move them out (to Applied / Contacted after first outreach, or to Rejected if you've decided not to engage) within a few days.",
          "Forgetting to filter by JD when you have multiple roles open. The board gets noisy fast.",
        ],
      },
    ],
  },

  {
    id: "chapter-8",
    number: "8",
    title: "The candidate detail page",
    summary:
      "/candidates/[id] is the single-pane view of one person. Contact info, attachments with signed-URL expiry behaviour, scoring history, and the Send cold email button's visibility conditions.",
    body: [
      {
        kind: "p",
        text:
          "Click any candidate card to open /candidates/[id]. This is the single-pane view of everything you know about one person. Top of the page: name, current title, location, stage badge (colour-coded), source badge, and a back-link to the tracker.",
      },
      { kind: "h3", text: "Contact section" },
      {
        kind: "p",
        text:
          "Email, phone, LinkedIn URL (clickable, opens in new tab), applied date, assigned JD, source URL. There's also a Send cold email button here. It is only visible when three conditions are all true: the candidate has an email on file, the candidate is assigned to a JD (the AI needs a JD to write a relevant email), and you have granted gmail.send scope to your account (visible in Settings → Integrations). If the button is greyed out, hover to see which condition is missing.",
      },
      { kind: "h3", text: "Interviews section" },
      {
        kind: "p",
        text:
          "All upcoming and past interviews with this candidate. Each row shows date, time, duration, status (scheduled / completed / cancelled / no-show), and a Google Meet link if attached. A Schedule interview button drops you on /schedule/new pre-populated with this candidate.",
      },
      { kind: "h3", text: "Extracted profile" },
      {
        kind: "p",
        text:
          "Skills (as chips), experience (company / title / dates / bullet points), education, and any detected language. This is whatever was captured at ingest time, edited as you've cleaned it up.",
      },
      { kind: "h3", text: "Source and attachments" },
      {
        kind: "p",
        text:
          "Original source material — the raw text or screenshot that went into the extractor — kept for reference and audit. PDFs and images have View / Download buttons that produce signed URLs: View links expire after 1 hour, Download links after 30 days. The expiry is for security — Supabase Storage signs every URL so no public link can leak permanently.",
      },
      { kind: "h3", text: "Scoring history" },
      {
        kind: "p",
        text:
          "Every score this candidate has been given, grouped by JD. The latest score for each JD is auto-open; older scores are collapsed. Each score shows the weighted total, threshold pass/fail badge, sub-scores, strengths, gaps, and prep questions. This is the page you open before a phone call — glance at the score, read the gaps, take the prep questions into the call.",
      },
      {
        kind: "mistakes",
        items: [
          "Bookmarking or sharing a signed View URL. It expires in an hour. Share the candidate page URL instead; anyone authorised who opens it can generate a fresh signed URL on demand.",
          "Editing the extracted skills/experience without realising they feed future scores. If you correct a wrong job title, that correction is what the AI sees on the next re-score.",
          "Treating an old score as current after you've edited the JD's must-haves. Re-score against the new rubric before making a decision.",
        ],
      },
    ],
  },

  {
    id: "chapter-9",
    number: "9",
    title: "Cold-email outreach",
    summary:
      "Opening the dialog, the model and language pickers, the anti-spam draft persona, editing before send, and the one-click \"Move to Applied / Contacted?\" follow-up.",
    body: [
      {
        kind: "p",
        text:
          "When you've found a candidate worth approaching, open their detail page and click Send cold email. The dialog walks you through draft → edit → send in one place.",
      },
      { kind: "h3", text: "Top of the dialog" },
      {
        kind: "p",
        text:
          "Model picker (Opus 4.7 default for better tone, Haiku 4.5 for cheaper and faster) and language picker (Thai default, English, or Auto-detect from the candidate's LinkedIn language).",
      },
      { kind: "h3", text: "History panel" },
      {
        kind: "p",
        text:
          "If you've drafted or sent emails to this candidate-JD pair before, the dialog shows the last 10 entries up front. Load a past draft to edit it (saves you re-spending tokens), or click Draft new to start fresh.",
      },
      { kind: "h3", text: "Drafting" },
      {
        kind: "p",
        text:
          "The AI streams a subject line and body in real time. The persona is anti-spam-shaped: no corporate clichés (\"excited to reach out\", \"your impressive background\"), must hook on a specific detail from the candidate's experience, honest about the role and why you think there's a fit.",
      },
      { kind: "h3", text: "Edit mode" },
      {
        kind: "p",
        text:
          "After the stream finishes, the dialog flips to edit mode. Subject and body become editable textareas. A collapsible Why this draft section shows the AI's reasoning so you understand its choices and can adjust them. A read-only signature preview shows what will be appended on send.",
      },
      { kind: "h3", text: "Sending" },
      {
        kind: "p",
        text:
          "Click Send. The system validates that subject and body are each at least 20 characters, then sends through your Gmail account via the gmail.send scope. The email is logged with timestamp and recipient. After a successful send, a toast appears asking \"Move to Applied / Contacted?\" — click once and the candidate's stage advances. The reason: cold-emailing is meaningful contact, and the tracker should reflect that without making you switch screens.",
      },
      { kind: "h3", text: "Re-attempts" },
      {
        kind: "p",
        text:
          "If the candidate hasn't responded after a few days and you want to try again, open the dialog and either edit the loaded draft or click Draft new for a fresh attempt with a different angle.",
      },
      {
        kind: "mistakes",
        items: [
          "Sending the AI draft without reading it. The AI is good but not infallible — read every word before you press Send. This is your name on the From line.",
          "Skipping the signature setup, then wondering why emails look unfinished. Set it once at Settings → Email Composer and forget about it.",
          "Re-running the draft over and over hoping the AI will write the email for you. Two regenerations is the limit; if you don't have something usable by then, edit by hand.",
        ],
      },
    ],
  },

  {
    id: "chapter-10",
    number: "10",
    title: "Scheduling interviews",
    summary:
      "Booking flow, the (warn-only) conflict detector, what the candidate-facing invite contains, reschedule/cancel, the Google → DB reconciliation, and the internal prep page.",
    body: [
      {
        kind: "p",
        text:
          "Two entry points. From a candidate's detail page, click Schedule interview — it drops you on /schedule/new with the candidate pre-filled. Or go to /schedule/new directly and pick the candidate from the dropdown.",
      },
      { kind: "h3", text: "The booking form" },
      {
        kind: "p",
        text:
          "Date, time, duration, and any extra invitees (panelists, hiring manager). As you change the date or time, a conflict warning runs in the background: the system checks your Google Calendar for the 30-minute window around your chosen slot and lists overlaps. The warning is never blocking — you can book over a conflict if you really mean to — but seeing the conflict in line catches almost every accidental double-book.",
      },
      { kind: "h3", text: "What happens on Save" },
      {
        kind: "ul",
        items: [
          "A Google Calendar event is created on your primary calendar.",
          "A Google Meet link is auto-attached.",
          "The candidate (and any extra invitees) receives a Hotel Plus-branded invite email with the Meet link, the role, and a short-link to download the candidate's CV — so panelists don't need to log into the app.",
          "The interview record is saved in the database and shows up on /schedule and on the candidate detail page.",
        ],
      },
      { kind: "h3", text: "Cancel or reschedule" },
      {
        kind: "p",
        text:
          "Go to /schedule, click the dropdown menu (three dots) on an interview row, and pick Cancel or Reschedule. Cancel deletes the Google event and sends a cancellation notice. Reschedule opens a small dialog with the same conflict-warning behaviour as the booking form.",
      },
      { kind: "h3", text: "The /schedule page itself" },
      {
        kind: "p",
        text:
          "/schedule shows two views: a Schedule-X calendar (month / week / day / agenda) and a list. Both are wired to the same data. On page load, the system runs a reconciliation pass against Google Calendar — if you cancelled an interview via Google Calendar directly, the app marks the row cancelled in the database so the two stay in sync. There's also a Refresh from Google button if you want to force a sync.",
      },
      { kind: "h3", text: "Interviewer prep" },
      {
        kind: "p",
        text:
          "The internal /interviews/[id]/prep page is for the interviewer (you or a panelist). It shows the candidate's strengths, gaps, and AI-generated prep questions in one place — open it from a Google Calendar invite's description, glance at it before the call, then close it. Candidates cannot reach this page (it requires a Hotel Plus login).",
      },
      {
        kind: "mistakes",
        items: [
          "Ignoring the conflict warning because \"it's probably wrong.\" It pulls live data from Google Calendar. If it says there's an overlap, there is.",
          "Cancelling via Google Calendar and assuming the Acquisition Pipeline knows. It does — but only on the next page-load reconciliation. If you cancel via Google and immediately load /schedule, click Refresh from Google to be sure.",
          "Letting an interview sit in \"scheduled\" state after it's actually happened. After the call, mark it Completed (or No-show, or Cancelled) via the dropdown — the data flows into reporting later.",
        ],
      },
    ],
  },

  {
    id: "chapter-11",
    number: "11",
    title: "The audit log and any-age Undo",
    summary:
      "/activity captures every mutation in the system. Any change can be undone at any age, with a concurrent-edit safety check.",
    body: [
      {
        kind: "p",
        text:
          "/activity is the page that proves we didn't lose anything. Every mutation in the system — every candidate creation, every stage move, every JD edit, every interview booking, every cold-email send — is captured as an audit row containing: who did it, when, the target table and row id, and the full before-state and after-state of the row.",
      },
      { kind: "h3", text: "What you see" },
      {
        kind: "p",
        text:
          "The page shows the most recent 100 rows, newest first. Each row has an Undo button. Undo works at any age — a move you made an hour ago, yesterday, or a month ago can still be undone. The system applies the before-state back over the current row.",
      },
      { kind: "h3", text: "The concurrent-edit safety check" },
      {
        kind: "p",
        text:
          "Each audit row stores a hash of the row's state at the time the change happened. When you click Undo, the system compares that hash to the row's current state. If the row has been modified since the audit row was written — i.e., someone else also changed it — Undo refuses and warns you, because applying an old before-state would overwrite that intervening change. The fix is to undo the intermediate changes first, in reverse chronological order.",
      },
      { kind: "h3", text: "When to Undo vs. edit forward" },
      {
        kind: "ul",
        items: [
          "Undo for genuine mistakes — a misdrag, a wrong stage move, a typo on a JD that you noticed minutes later.",
          "Edit forward for normal evolution — a candidate has actually moved through the funnel, a JD has been refined, an interview has been rescheduled. Keep the history; don't try to rewrite it via Undo.",
        ],
      },
      { kind: "h3", text: "Use as a forensic tool" },
      {
        kind: "p",
        text:
          "The activity feed is also useful as a \"where did this come from\" tool. If a candidate is in an unexpected stage, find them in the feed and you'll see who moved them and when.",
      },
      {
        kind: "mistakes",
        items: [
          "Using Undo to \"rewind to yesterday\" across many changes. There's no batch undo — each row is its own button. If you've made twenty changes you want to revert, do them one at a time in reverse chronological order.",
          "Ignoring the concurrent-edit warning. If the system refuses an undo, there's a reason (another change in between). Resolve the intermediate change first.",
          "Treating the audit log as your archive. It is, technically, but exports and reporting are separate concerns.",
        ],
      },
    ],
  },

  {
    id: "chapter-12",
    number: "12",
    title: "Settings reference, troubleshooting, and glossary",
    summary:
      "What each Settings section controls, common errors with fixes, and a one-stop glossary for the AI-Q&A use case.",
    body: [
      { kind: "h3", text: "Settings sections at a glance" },
      {
        kind: "table",
        headers: ["Section", "What it controls"],
        rows: [
          ["/settings/prompts", "Org-wide AI scoring persona. Editing creates a new version; past scores keep their original version."],
          ["/settings/integrations", "Google connection status (per scope), Apify token, Proxycurl key."],
          ["/settings/email-composer", "Your cold-email signature and From display name."],
          ["/settings/capture", "Bookmarklet generation, plus the (planned) auto-import-from-Gmail panel."],
        ],
      },
      { kind: "h3", text: "Common errors and fixes" },
      {
        kind: "table",
        headers: ["Error", "Likely cause", "Fix"],
        rows: [
          [
            "\"Google scopes missing\" banner",
            "You signed in without granting Calendar or Gmail scope.",
            "Click Re-sign in with Google at /settings/integrations and approve the missing scopes.",
          ],
          [
            "Bookmarklet stops working overnight",
            "Your token was regenerated (by you or someone with access).",
            "Go to /settings/capture and drag the new bookmarklet button to your bookmarks bar; delete the old one.",
          ],
          [
            "AI score doesn't return / spins forever",
            "JD has no must-haves list, or its body is empty.",
            "Open the JD, add at least one must-have, save, then re-run the score.",
          ],
          [
            "Send cold email button is greyed out",
            "Candidate has no email, no JD assigned, or you lack gmail.send scope.",
            "Hover the button — the tooltip names which condition is missing — and fix that.",
          ],
          [
            "Conflict warning won't appear when scheduling",
            "Your Google Calendar isn't connected, or calendar.freebusy scope is missing.",
            "/settings/integrations → re-sign in with Google.",
          ],
          [
            "Candidate looks duplicated",
            "Same CV PDF uploaded twice; the content-hash dedup catches identical files but not minor variations.",
            "Open both records; merge data manually into one and Reject the other (it stays in the audit log).",
          ],
        ],
      },
      { kind: "h3", text: "Glossary" },
      {
        kind: "p",
        text:
          "A quick reference for the AI when you drop this document in a chat.",
      },
      {
        kind: "ul",
        items: [
          "Sourcing — the act of finding candidates you don't already have. Outbound LinkedIn search lives under Find candidates on a JD page.",
          "Screening — the AI-assisted scoring step. Happens at /screener, or automatically as part of outbound sourcing.",
          "Threshold — the score cut-off a JD considers acceptable. Set per JD.",
          "Persona — the AI scoring system prompt. Org-wide default at /settings/prompts; per-JD override on the JD editor.",
          "Scope — a permission granted to the app by Google. Calendar / FreeBusy / Gmail Compose / Gmail Send are the four that matter here.",
          "Stage — a candidate's position in the funnel. Eight stages, in order, from Sourced to Rejected.",
          "Single-agent vs. Team-of-3 — scoring modes. Team-of-3 runs three agents at different temperatures plus a manager, costing about 4× a single-agent run.",
          "Inbound vs. Outbound — inbound candidates applied to you (or you captured them passively); outbound candidates were found by the Find candidates search.",
        ],
      },
      {
        kind: "p",
        text:
          "That's the SOP. If something here is wrong, out of date, or confusing, tell your team lead — this document is meant to evolve.",
      },
      {
        kind: "mistakes",
        items: [
          "Treating an integration as \"good enough\" without checking the scope-by-scope status panel. The Google connection is several scopes, not one — any of them can be missing.",
          "Reading this glossary instead of the chapters when something goes wrong. The glossary is for quick reference; the chapters explain how to use the features.",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Markdown serializer — derived from the same SOP_SECTIONS the page renders.
// ---------------------------------------------------------------------------

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function blockToMarkdown(block: SopBlock): string {
  switch (block.kind) {
    case "p":
      return block.text + "\n";
    case "h3":
      return "### " + block.text + "\n";
    case "ul":
      return block.items.map((i) => "- " + i).join("\n") + "\n";
    case "ol":
      return block.items.map((i) => "1. " + i).join("\n") + "\n";
    case "table": {
      const header = "| " + block.headers.map(escapeCell).join(" | ") + " |";
      const divider = "| " + block.headers.map(() => "---").join(" | ") + " |";
      const rows = block.rows.map(
        (r) => "| " + r.map(escapeCell).join(" | ") + " |",
      );
      return [header, divider, ...rows].join("\n") + "\n";
    }
    case "mistakes": {
      const items = block.items.map((i) => "> - " + i).join("\n");
      return "> **Common mistakes**\n" + items + "\n";
    }
    case "callout": {
      const title = block.title ? "> **" + block.title + "**\n>\n" : "";
      return title + "> " + block.text + "\n";
    }
  }
}

function sectionToMarkdown(section: SopSection): string {
  const parts: string[] = [];
  parts.push("## " + section.number + ". " + section.title);
  if (section.summary) parts.push("_" + section.summary + "_");
  for (const block of section.body) parts.push(blockToMarkdown(block));
  return parts.join("\n");
}

function buildMarkdown(): string {
  const parts: string[] = [];
  parts.push("# " + SOP_META.title);
  parts.push("_" + SOP_META.subtitle + "_");
  parts.push("Last updated: " + SOP_META.lastUpdated);
  parts.push(blockToMarkdown(SOP_INTRO));
  for (const section of SOP_SECTIONS) parts.push(sectionToMarkdown(section));
  return parts.join("\n");
}

export const SOP_MARKDOWN: string = buildMarkdown();
