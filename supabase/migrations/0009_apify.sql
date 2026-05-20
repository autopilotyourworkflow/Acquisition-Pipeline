-- Phase 3d — swap LinkedIn provider from Proxycurl to Apify
--
-- Apify's marketplace LinkedIn actors are cheaper and have a free $5/month
-- credit, vs. Proxycurl's paid-only B2B model. We keep the Proxycurl
-- column for backwards compat with the Scraper's Third-party tab (which
-- still references it), but the outbound sourcing flow now uses Apify.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS apify_api_token_encrypted bytea;
