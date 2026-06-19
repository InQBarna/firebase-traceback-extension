## Version 0.7.0

- New API endpoint to create links programmatically
- Redesigned preview page with campaign images
- Apple campaign info stored in database and shown on preview redirect
- Platform dimension added to campaign analytics
- Auto-redirect to desktop app store with Google Play / App Store buttons
- Referral attribution forwarded in `referral_traceback` field when available
- Fixed preview analytics being reported twice
- UTM parameters forwarded in all campaign scenarios (improved)
- Clipboard and unique match defaults to not used unless activaed inside a campaign

## Version 0.6.0

- Now utm_* parameters are forwared on all campaigns
- Fix campaign with already extracted link parameter now reported to traceback analytics

## Version 0.5.1

- Fixes to analytics

## Version 0.5.0

- Daily analytics for dynamic/short links with new structure (open_link_preview, redirects, first_opens_intent, first_opens_install, reopens)
- Added API key security for debug endpoints (v1_doctor, v1_campaigns, v1_campaign_debug)
- New campaign debug endpoints: v1_campaigns (JSON) and v1_campaign_debug (mobile-responsive HTML)
- Consolidated doctor endpoint into dynamichostingcontent (removed standalone Cloud Function)
- Enhanced initialization logging with [INIT], [INIT:SAMPLE_LINK], and [INIT:API_KEY] prefixes
- Sample data (dynamic link + API key) now created on both install and update
- Improved error handling and resilience in initialization process

## Version 0.4.1

- Bugfix app installation time mismatch with iOS sdk

## Version 0.4.0

- Returning unique, heuristics, ambiguous, none in match_type
- Dynamic/short links baseline working

## Version 0.3.0

- Heuristic search highly improved

## Version 0.2.2

- Doctor endpoint improved

## Version 0.2.1

- Referrer for android indicated in external services

## Version 0.2.0

- Using referrer for android

## Version 0.1.2

- YAML updated with external services (itunes connect api)

## Version 0.1.1

- Using client's web browser app name for heuristics scoring.
- Using appInstallation time for heuristics filter.

## Version 0.1.0

- Initial version launched on 3 different project, Almost production ready

## Version 0.0.3

- Fixes and analytics for dark launching

## Version 0.0.2

- Initial Version
