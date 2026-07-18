# Privacy Policy

_Last updated: 2026-07-18_

WikiAsOfNow finds Wikipedia claims that may have gone stale, and lets you request
research on one if you sign in. It's short because we hold very little.

## Browsing without an account

You can look up articles and read detected claims without signing in. We don't
associate anything with you when you browse anonymously.

## Signing in with Google

Signing in is only for requesting research on a claim. When you do, we store your
**email address**, the **identifier Google uses for your account** (so we can recognize
you when you sign back in), and your account's creation date. We also generate an
**internal account id** (a one-way hash of that Google identifier; we never see your
password). We use these to let you request research and to enforce daily usage limits.

**We don't sell your personal data or share it with anyone for their own use.** Google
is our sign-in provider, and Cloudflare, our hosting provider, stores and processes
this data as our data processor. (Requesting research fetches and searches public web
content through other services, which never receive your identity or any personal
data.)

## Activity log

We keep an append-only log for integrity and abuse-prevention. It records only short
codes and identifiers, never your searches, article text, or any free text about you.
When you're signed in, entries carry your opaque account id; once you delete your
account, we no longer hold anything that links that id to you (signing back in with
the same Google account would recreate the same id). Anonymous actions carry no
personal identifier at all.

## Cookies

One session cookie (`wikinow_session`) keeps you signed in, plus two short-lived
cookies during Google sign-in. We use no analytics, advertising, or tracking cookies.

## Deleting your account

Delete your account anytime from the account menu while signed in. This removes your
email, the Google identifier, and your whole account profile for good and signs you out.
We keep anonymized daily usage counts to enforce overall limits, but nothing that links
them back to you.

## Questions

Ask in our [GitHub Discussions](https://github.com/scarson/wiki-as-of-now/discussions).

## Changes

If this policy changes, we'll update the date above and the version in our public repo.
