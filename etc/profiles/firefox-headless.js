/**
 * @fileoverview
 *   Default preferences used for running Firefox headlessly.
 *   Shamelessly hocked from more knowledgeable sources.
 *
 * @sources
 *   [Karma's Firefox launcher    ]{@link https://github.com/karma-runner/karma-firefox-launcher/blob/7cee901index.js}
 *   [Mozilla's Marionette driver ]{@link https://github.com/mozilla/gecko-dev/blob/7e953e97a3ab7/testing/marionette/client/marionette_driver/geckoinstance.py}
 */

user_pref("devtools.enabled", true);
user_pref("devtools.chrome.enabled", true);
user_pref("devtools.debugger.prompt-connection", false);
user_pref("devtools.debugger.remote-enabled", true);
user_pref("devtools.experiment.f12.shortcut_disabled", true);
user_pref("devtools.policy.disabled", true);
user_pref("marionette.port", 1338);
user_pref("marionette.defaultPrefs.port", 1338);
user_pref("marionette.log.level", "Trace");
user_pref("marionette.logging", "Trace");


// Stuff pinched from Karma's Firefox launcher
user_pref("browser.bookmarks.restore_default_bookmarks", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.tabs.remote.autostart", false);
user_pref("browser.tabs.remote.autostart.2", false);
user_pref("dom.disable_open_during_load", false);
user_pref("dom.max_script_run_time", 0);
user_pref("dom.min_background_timeout_value", 10);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);


// Stop Shield from hitting the network
user_pref("app.normandy.api_url", "");

// Increase the APZ content response timeout in tests to 1 minute. This is to
// accommodate the fact that test environments tend to be slower than production
// environments, leading to the production timeout value sometimes being exceeded
// and causing false-positive test failures.
user_pref("apz.content_response_timeout", 60000);

// Disable geolocation ping
user_pref("browser.region.network.url", "");

// Don't pull Top Sites content from the network
user_pref("browser.topsites.contile.enabled", false);

// Disable UI tour and captive portal
user_pref("browser.uitour.url",          "http://%(server)s/uitour-dummy/tour");
user_pref("browser.uitour.pinnedTabUrl", "http://%(server)s/uitour-dummy/pinnedTab");
user_pref("captivedetect.canonicalURL",  "");

// Defensively disable data reporting systems
user_pref("datareporting.healthreport.documentServerURI", "http://%(server)s/dummy/healthreport/");
user_pref("datareporting.healthreport.logging.consoleEnabled", false);
user_pref("datareporting.healthreport.service.enabled", false);
user_pref("datareporting.healthreport.service.firstRun", false);
user_pref("datareporting.healthreport.uploadEnabled", false);

// Do not show datareporting policy notifications which can interfere with tests
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);

// Automatically unload beforeunload alerts
user_pref("dom.disable_beforeunload", true);

// Enable support for File object creation in the content process
user_pref("dom.file.createInChild", true);

// Disable the ProcessHangMonitor
user_pref("dom.ipc.reportProcessHangs", false);

// No slow script dialogs
user_pref("dom.max_script_run_time", 0);
user_pref("dom.max_chrome_script_run_time", 0);

// DOM Push
user_pref("dom.push.connection.enabled", false);

// Disable dialog abuse when alerts are triggered very rapidly
user_pref("dom.successive_dialog_time_limit", 0);

// Only load extensions from the application and user profile
// AddonManager.SCOPE_PROFILE + AddonManager.SCOPE_APPLICATION
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 5);

// Disable metadata caching for installed add-ons by default
user_pref("extensions.getAddons.cache.enabled", false);

// Disable intalling any distribution add-ons
user_pref("extensions.installDistroAddons", false);

// Turn off extension updates so they don't bother tests
user_pref("extensions.update.enabled", false);
user_pref("extensions.update.notifyUser", false);

// Redirect various extension update URLs
user_pref("extensions.blocklist.detailsURL",   "http://%(server)s/extensions-dummy/blocklistDetailsURL");
user_pref("extensions.blocklist.itemURL",      "http://%(server)s/extensions-dummy/blocklistItemURL");
user_pref("extensions.hotfix.url",             "http://%(server)s/extensions-dummy/hotfixURL");
user_pref("extensions.systemAddon.update.url", "http://%(server)s/dummy-system-addons.xml");
user_pref("extensions.update.background.url",  "http://%(server)s/extensions-dummy/updateBackgroundURL");
user_pref("extensions.update.url",             "http://%(server)s/extensions-dummy/updateURL");

// Make sure opening `about:addons` won't hit the network
user_pref("extensions.getAddons.discovery.api_url", "data:, ");
user_pref("extensions.getAddons.get.url",           "http://%(server)s/extensions-dummy/repositoryGetURL");
user_pref("extensions.getAddons.search.browseURL",  "http://%(server)s/extensions-dummy/repositoryBrowseURL");

// Grok user focus even when running in the background
user_pref("focusmanager.testmode", true);

// Disable user-agent updates
user_pref("general.useragent.updates.enabled", false);

// Disable geolocation ping
user_pref("geo.provider.network.url", "");

// Always use network provider for geolocation tests so we
// bypass macOS dialog raised by the corelocation provider
user_pref("geo.provider.testing", true);

// Don't scan for Wi-Fi networks
user_pref("geo.wifi.scan", false);

// Ensure webrender is on, no need for environment variables
user_pref("gfx.webrender.all", true);

// Disable idle-daily notifications to avoid expensive operations
// that may cause unexpected test timeouts
user_pref("idle.lastDailyNotification", -1);

// Disable Firefox accounts ping
user_pref("identity.fxaccounts.auth.uri", "https://{server}/dummy/fxa");

// Disable download and usage of OpenH264, and Widevine plugins
user_pref("media.gmp-manager.updateEnabled", false);

// Disable the GFX sanity window
user_pref("media.sanity-test.disabled", true);
user_pref("media.volume_scale", "0.01");

// Disable connectivity service pings
user_pref("network.connectivity-service.enabled", false);

// Don't prompt for temporary redirects
user_pref("network.http.prompt-temp-redirect", false);

// Don't automatically switch between offline and online
user_pref("network.manage-offline-status", false);

// Make sure SNTP requests don't hit the network
user_pref("network.sntp.pools", "%(server)s");

// Privacy and tracking protection
user_pref("privacy.trackingprotection.enabled", false);

// Disable recommended automation preferences in CI
user_pref("remote.prefs.recommended", false);

// Don't make network connections for man-in-the-middle priming
user_pref("security.certerrors.mitm.priming.enabled", false);

// Don't wait for the notification button security delay in tests
user_pref("security.notification_enable_delay", 0);

// Ensure blocklist updates don't hit the network
user_pref("services.settings.server", "");

// Disable password capture, so that tests that include forms aren"t
// influenced by the presence of the persistent doorhanger notification
user_pref("signon.rememberSignons", false);

// Prevent starting into safe mode after application crashes
user_pref("toolkit.startup.max_resumed_crashes", -1);

// Disable most telemetry pings
user_pref("toolkit.telemetry.server", "");

// Enable output for dump() and chrome console API
user_pref("browser.dom.window.dump.enabled", true);
user_pref("devtools.console.stdout.chrome", true);

// Disable safe browsing / tracking protection updates
user_pref("browser.safebrowsing.update.enabled", false);
user_pref("browser.sessionstore.resume_from_crash", false);

// Do not allow background tabs to be zombified, otherwise for tests that
// open additional tabs, the test harness tab itself might get unloaded
user_pref("browser.tabs.disableBackgroundZombification", true);
