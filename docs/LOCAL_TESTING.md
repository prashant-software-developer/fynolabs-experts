# Running and checking Expert Hub on your PC

There is one environment: the database in the Neon project **expert-hub**. Everything you do in the app on your PC is live (the same data the team sees). There is no demo mode and no automatic sign-in.

## Set it up (once)

1. **Set up the database.** Open [neon.tech](https://neon.tech) with the FynoLabs admin account, open the project **expert-hub**, press **Connect**, keep the main branch and copy the connection string (it starts with `postgresql://`). In this folder, open `.env.local` in Notepad (or create it) and add one line: `DATABASE_URL=the string you copied`. Save it. Keep that string private: it contains a password.
2. **Double-click `Copy experts from Engine.bat`.** It creates the tables and brings every expert record across from the old jobs site (dry run first, then type YES). Details: [DEPLOY.md, step 3](DEPLOY.md#3-copy-everything-from-engine).
3. **Double-click `Create my admin account.bat`.** Press Enter to keep `prashant@xocket.sh` and the name Prashant. Then type a password (at least 10 characters) twice: nothing shows on screen while you type, that's normal. Or just press Enter and a strong password is made for you and shown once: copy it, you'll choose your own when you first sign in. Run it again any time: it asks "Reset the password? (yes/no)", so it's also how you get back in if you forget your password.
4. **Double-click `Start Expert Hub.bat`** and sign in at http://localhost:3000/signin with that email and password. Keep the black window open while you use the app; close it to stop.

The launchers install packages the first time (and again after an update), which takes a few minutes. `.env.local` is git-ignored, so it's never committed. Without `DATABASE_URL` every page shows **Database not set up** with the same four Neon steps.

## What to check (about 20 minutes)

### Signing in

| Step | Try this |
|---|---|
| Sign in | http://localhost:3000/signin: your email and password. You land on the admin. Type a wrong password first: it says "Email or password is incorrect" (the same for an email that has no account). |
| Generated password | If you pressed Enter for a generated password, you're sent to **Choose your own password** first; nothing else opens until you do. |
| Change password | Click your email in the admin's top bar: current password, then the new one twice. You stay signed in here and are signed out everywhere else. |
| Add a team member | Admin → **Team & access** → Add a team member: an email, name and role (try Recruiter). A box shows their **temporary password** once, with Copy. Reload the page: it's gone for good. |
| Sign in as them | Sign out (top right), sign in with that email and temporary password: you must choose a new password, then you see what a recruiter sees (no Team & access, no money). Sign out. |
| Reset and turn off | As admin, on Team & access: **Reset password** for that member (a new temporary password, shown once; the old one stops working), then **Turn off**: they're signed out and can't sign in until you turn them back on. The **Last sign-in** column shows who has signed in. |
| Locked after 5 tries | Five wrong passwords for one account lock it for 15 minutes ("Too many attempts"). |

### Experts

Sign-up with a password needs email to be set up (Resend or SMTP, see [DEPLOY.md step 5](DEPLOY.md#5-email-resend-or-smtp)). Without it `/join` says sign-up opens soon (or offers Google when that's set up), and the job forms still work without an account.

| Step | Try this |
|---|---|
| Sign up | In a private window: http://localhost:3000/join with your own personal email: name, email, password twice, tick the consent box, **Create account**. |
| Confirm the email | You get an email with a 6-digit code (and a link). Enter the code on **Check your email**. Until then the account sees no profile at all. A wrong code says so; after 5 tries, or 30 minutes, send a new code. |
| Your profile | You land on **My profile** (`/me`). If the hub already had you (copied from the jobs site, same email), it's your existing profile with everything in it. Complete a step or two. |
| Forgot password | Sign out, **Forgot password?** on the sign-in page, enter the email: the link in the email lets you choose a new password once, within 30 minutes. |
| The admin wall | As the expert, open http://localhost:3000/admin: "This part is for the team" (403). |
| Team emails | Try to sign up with an @xocket.sh address: refused ("Team accounts are set up by an admin"). |

### The rest of the admin

| Page | Try this |
|---|---|
| Dashboard `/admin` | Jobs taking applications, counts by status, open requirements and slots, recent activity |
| Experts `/admin/experts` | Search by a skill; filter by domain, country and status; tick a few, then "Add to requirement"; "Export CSV" |
| One expert | Edit a field and save; job applications; submissions and placements; download the CV |
| Requirements and jobs | Paste a partner requirement, check the pre-filled fields, open the matches; **Create job from requirement**, build the form, publish it, open the public link in a private window and apply |
| Roles | Sign in as the recruiter you added: no money, no Team & access; jobs yes |
| Phone width | Shrink the window on the sign-in page, a job page and the admin: everything stacks; the menu button opens the admin navigation |

Write down anything that looks off (a screenshot and the page name is enough) and send it to Claude.

## If something goes wrong

- **"Database not set up"**: `.env.local` has no `DATABASE_URL` (or the line is misspelled). Do step 1, then start the app again.
- **Forgot your password**: double-click `Create my admin account.bat` again and answer **yes** to "Reset the password?".
- **"Node.js is not installed"**: install the LTS version from https://nodejs.org, then run the .bat again.
- **Port 3000 is busy**: close the other app, or run `npm run dev -- -p 3001` in this folder.
- **A strange error after an update**: delete the `node_modules` and `.next` folders, then start again.
- **The `.data` folder** is left over from the old demo mode and isn't used any more: you can delete it.
