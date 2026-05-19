import 'https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/dist/cookieconsent.umd.js';

CookieConsent.run({
    guiOptions: {
        consentModal: {
            layout: "bar inline",
            position: "bottom",
            equalWeightButtons: true,
            flipButtons: false
        },
        preferencesModal: {
            layout: "box",
            position: "right",
            equalWeightButtons: true,
            flipButtons: false
        }
    },
    categories: {
        necessary: {
          readOnly: true
        },
        functionality: {},
        analytics: {},
        marketing: {}
    },
    language: {
        default: "en",
        autoDetect: "browser",
        translations: {
            en: {
                consentModal: {
                    title: "Hello traveller, it's cookie time!",
                    description: "We use cookies to keep PlayInClouds working properly, remember your preferences, understand how the app is used, and show relevant content. You can accept all cookies or manage your choices.",
                    acceptAllBtn: "Accept all",
                    acceptNecessaryBtn: "Reject all",
                    showPreferencesBtn: "Manage preferences",
                    footer: "<a href=\"#link\">Privacy Policy</a>\n<a href=\"#link\">Terms and conditions</a>"
                },
                preferencesModal: {
                    title: "Consent Preferences Center",
                    acceptAllBtn: "Accept all",
                    acceptNecessaryBtn: "Reject all",
                    savePreferencesBtn: "Save preferences",
                    closeIconLabel: "Close modal",
                    serviceCounterLabel: "Service|Services",
                    sections: [
                        {
                            title: "Cookie Usage",
                            description: "We use cookies and similar technologies to run core site features, save your settings, measure performance, and improve your experience in PlayInClouds. You can update your consent choices at any time."
                        },
                        {
                            title: "Strictly Necessary Cookies <span class=\"pm__badge\">Always Enabled</span>",
                            description: "These cookies are required for essential functions such as security, session management, and basic navigation. Without them, PlayInClouds cannot operate correctly.",
                            linkedCategory: "necessary"
                        },
                        {
                            title: "Functionality Cookies",
                            description: "These cookies remember your preferences, such as interface settings and feature selections, so PlayInClouds can provide a more personalized experience.",
                            linkedCategory: "functionality"
                        },
                        {
                            title: "Analytics Cookies",
                            description: "These cookies help us understand how visitors use PlayInClouds by collecting aggregated usage data. This helps us improve performance, reliability, and overall usability.",
                            linkedCategory: "analytics"
                        },
                        {
                            title: "Advertisement Cookies",
                            description: "These cookies may be used to deliver more relevant ads and limit repeated ad exposure. They can also help measure campaign effectiveness when enabled.",
                            linkedCategory: "marketing"
                        },
                        {
                            title: "More information",
                            description: "If you have any questions about our cookie policy or your consent choices, please <a class=\"cc__link\" href=\"#artemmelnikov.com\">contact us</a>."
                        }
                    ]
                }
            }
        }
    }
});