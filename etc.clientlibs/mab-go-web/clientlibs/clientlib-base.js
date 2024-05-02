
/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Accordion: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;
    var delay = 100;

    var NS = "cmp";
    var IS = "accordion";

    var keyCodes = {
        ENTER: 13,
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var cssClasses = {
        button: {
            disabled: "cmp-accordion__button--disabled",
            expanded: "cmp-accordion__button--expanded"
        },
        panel: {
            hidden: "cmp-accordion__panel--hidden",
            expanded: "cmp-accordion__panel--expanded"
        }
    };

    var dataAttributes = {
        item: {
            expanded: "data-cmp-expanded"
        }
    };

    var properties = {
        /**
         * Determines whether a single accordion item is forced to be expanded at a time.
         * Expanding one item will collapse all others.
         *
         * @memberof Accordion
         * @type {Boolean}
         * @default false
         */
        "singleExpansion": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Accordion Configuration.
     *
     * @typedef {Object} AccordionConfig Represents an Accordion configuration
     * @property {HTMLElement} element The HTMLElement representing the Accordion
     * @property {Object} options The Accordion options
     */

    /**
     * Accordion.
     *
     * @class Accordion
     * @classdesc An interactive Accordion component for toggling panels of related content
     * @param {AccordionConfig} config The Accordion configuration
     */
    function Accordion(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Accordion.
         *
         * @private
         * @param {AccordionConfig} config The Accordion configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            if (that._elements["item"]) {
                // ensures multiple element types are arrays.
                that._elements["item"] = Array.isArray(that._elements["item"]) ? that._elements["item"] : [that._elements["item"]];
                that._elements["button"] = Array.isArray(that._elements["button"]) ? that._elements["button"] : [that._elements["button"]];
                that._elements["panel"] = Array.isArray(that._elements["panel"]) ? that._elements["panel"] : [that._elements["panel"]];

                if (that._properties.singleExpansion) {
                    var expandedItems = getExpandedItems();
                    // multiple expanded items annotated, display the last item open.
                    if (expandedItems.length > 1) {
                        toggle(expandedItems.length - 1);
                    }
                }

                refreshItems();
                bindEvents();
                scrollToDeepLinkIdInAccordion();
            }
            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Accordion component
                 * - if so, route the "navigate" operation to enact a navigation of the Accordion based on index data
                 */
                window.CQ.CoreComponents.MESSAGE_CHANNEL = window.CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                window.CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-accordion" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            // switch to single expansion mode when navigating in edit mode.
                            var singleExpansion = that._properties.singleExpansion;
                            that._properties.singleExpansion = true;
                            toggle(message.data.index);

                            // revert to the configured state.
                            that._properties.singleExpansion = singleExpansion;
                        }
                    }
                });
            }
        }

        /**
         * Displays the panel containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInAccordion() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "item", "item");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["item"][deepLinkItemIdx];
                    if (deepLinkItem && !deepLinkItem.hasAttribute(dataAttributes.item.expanded)) {
                        // if single expansion: close all accordion items
                        if (that._properties.singleExpansion) {
                            for (var j = 0; j < that._elements["item"].length; j++) {
                                if (that._elements["item"][j].hasAttribute(dataAttributes.item.expanded)) {
                                    setItemExpanded(that._elements["item"][j], false, true);
                                }
                            }
                        }
                        // expand the accordion item containing the deep link
                        setItemExpanded(deepLinkItem, true, true);
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Caches the Accordion elements as defined via the {@code data-accordion-hook="ELEMENT_NAME"} markup API.
         *
         * @private
         * @param {HTMLElement} wrapper The Accordion wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                if (hook.closest("." + NS + "-" + IS) === that._elements.self) { // only process own accordion elements
                    var capitalized = IS;
                    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                    var key = hook.dataset[NS + "Hook" + capitalized];
                    if (that._elements[key]) {
                        if (!Array.isArray(that._elements[key])) {
                            var tmp = that._elements[key];
                            that._elements[key] = [tmp];
                        }
                        that._elements[key].push(hook);
                    } else {
                        that._elements[key] = hook;
                    }
                }
            }
        }

        /**
         * Sets up properties for the Accordion based on the passed options.
         *
         * @private
         * @param {Object} options The Accordion options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Accordion event handling.
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInAccordion, false);
            var buttons = that._elements["button"];
            if (buttons) {
                for (var i = 0; i < buttons.length; i++) {
                    (function(index) {
                        buttons[i].addEventListener("click", function(event) {
                            toggle(index);
                            focusButton(index);
                        });
                        buttons[i].addEventListener("keydown", function(event) {
                            onButtonKeyDown(event, index);
                        });
                    })(i);
                }
            }
        }

        /**
         * Handles button keydown events.
         *
         * @private
         * @param {Object} event The keydown event
         * @param {Number} index The index of the button triggering the event
         */
        function onButtonKeyDown(event, index) {
            var lastIndex = that._elements["button"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        focusButton(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        focusButton(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    focusButton(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    focusButton(lastIndex);
                    break;
                case keyCodes.ENTER:
                case keyCodes.SPACE:
                    event.preventDefault();
                    toggle(index);
                    focusButton(index);
                    break;
                default:
                    return;
            }
        }

        /**
         * General handler for toggle of an item.
         *
         * @private
         * @param {Number} index The index of the item to toggle
         */
        function toggle(index) {
            var item = that._elements["item"][index];
            if (item) {
                if (that._properties.singleExpansion) {
                    // ensure only a single item is expanded if single expansion is enabled.
                    for (var i = 0; i < that._elements["item"].length; i++) {
                        if (that._elements["item"][i] !== item) {
                            var expanded = getItemExpanded(that._elements["item"][i]);
                            if (expanded) {
                                setItemExpanded(that._elements["item"][i], false);
                            }
                        }
                    }
                }
                setItemExpanded(item, !getItemExpanded(item));

                if (dataLayerEnabled) {
                    var accordionId = that._elements.self.id;
                    var expandedItems = getExpandedItems()
                        .map(function(item) {
                            return getDataLayerId(item);
                        });

                    var uploadPayload = { component: {} };
                    uploadPayload.component[accordionId] = { shownItems: expandedItems };

                    var removePayload = { component: {} };
                    removePayload.component[accordionId] = { shownItems: undefined };

                    dataLayer.push(removePayload);
                    dataLayer.push(uploadPayload);
                }
            }
        }

        /**
         * Sets an item's expanded state based on the provided flag and refreshes its internals.
         *
         * @private
         * @param {HTMLElement} item The item to mark as expanded, or not expanded
         * @param {Boolean} expanded true to mark the item expanded, false otherwise
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function setItemExpanded(item, expanded, keepHash) {
            if (expanded) {
                item.setAttribute(dataAttributes.item.expanded, "");
                var index = that._elements["item"].indexOf(item);
                if (!keepHash && containerUtils) {
                    containerUtils.updateUrlHash(that, "item", index);
                }
                if (dataLayerEnabled) {
                    dataLayer.push({
                        event: "cmp:show",
                        eventInfo: {
                            path: "component." + getDataLayerId(item)
                        }
                    });
                }

            } else {
                item.removeAttribute(dataAttributes.item.expanded);
                if (!keepHash && containerUtils) {
                    containerUtils.removeUrlHash();
                }
                if (dataLayerEnabled) {
                    dataLayer.push({
                        event: "cmp:hide",
                        eventInfo: {
                            path: "component." + getDataLayerId(item)
                        }
                    });
                }
            }
            refreshItem(item);
        }

        /**
         * Gets an item's expanded state.
         *
         * @private
         * @param {HTMLElement} item The item for checking its expanded state
         * @returns {Boolean} true if the item is expanded, false otherwise
         */
        function getItemExpanded(item) {
            return item && item.dataset && item.dataset["cmpExpanded"] !== undefined;
        }

        /**
         * Refreshes an item based on its expanded state.
         *
         * @private
         * @param {HTMLElement} item The item to refresh
         */
        function refreshItem(item) {
            var expanded = getItemExpanded(item);
            if (expanded) {
                expandItem(item);
            } else {
                collapseItem(item);
            }
        }

        /**
         * Refreshes all items based on their expanded state.
         *
         * @private
         */
        function refreshItems() {
            for (var i = 0; i < that._elements["item"].length; i++) {
                refreshItem(that._elements["item"][i]);
            }
        }

        /**
         * Returns all expanded items.
         *
         * @private
         * @returns {HTMLElement[]} The expanded items
         */
        function getExpandedItems() {
            var expandedItems = [];

            for (var i = 0; i < that._elements["item"].length; i++) {
                var item = that._elements["item"][i];
                var expanded = getItemExpanded(item);
                if (expanded) {
                    expandedItems.push(item);
                }
            }

            return expandedItems;
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as expanded
         */
        function expandItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.add(cssClasses.button.expanded);
                // used to fix some known screen readers issues in reading the correct state of the 'aria-expanded' attribute
                // e.g. https://bugs.webkit.org/show_bug.cgi?id=210934
                setTimeout(function() {
                    button.setAttribute("aria-expanded", true);
                }, delay);
                panel.classList.add(cssClasses.panel.expanded);
                panel.classList.remove(cssClasses.panel.hidden);
                panel.setAttribute("aria-hidden", false);
            }
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is not expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as not expanded
         */
        function collapseItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.remove(cssClasses.button.expanded);
                // used to fix some known screen readers issues in reading the correct state of the 'aria-expanded' attribute
                // e.g. https://bugs.webkit.org/show_bug.cgi?id=210934
                setTimeout(function() {
                    button.setAttribute("aria-expanded", false);
                }, delay);
                panel.classList.add(cssClasses.panel.hidden);
                panel.classList.remove(cssClasses.panel.expanded);
                panel.setAttribute("aria-hidden", true);
            }
        }

        /**
         * Focuses the button at the provided index.
         *
         * @private
         * @param {Number} index The index of the button to focus
         */
        function focusButton(index) {
            var button = that._elements["button"][index];
            button.focus();
        }
    }

    /**
     * Reads options data from the Accordion wrapper element, defined via {@code data-cmp-*} data attributes.
     *
     * @private
     * @param {HTMLElement} element The Accordion element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Accordion components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Accordion({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Accordion({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
/* global
    CQ
 */
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Tabs: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;

    var NS = "cmp";
    var IS = "tabs";

    var keyCodes = {
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        active: {
            tab: "cmp-tabs__tab--active",
            tabpanel: "cmp-tabs__tabpanel--active"
        }
    };

    /**
     * Tabs Configuration
     *
     * @typedef {Object} TabsConfig Represents a Tabs configuration
     * @property {HTMLElement} element The HTMLElement representing the Tabs
     * @property {Object} options The Tabs options
     */

    /**
     * Tabs
     *
     * @class Tabs
     * @classdesc An interactive Tabs component for navigating a list of tabs
     * @param {TabsConfig} config The Tabs configuration
     */
    function Tabs(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Tabs
         *
         * @private
         * @param {TabsConfig} config The Tabs configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            cacheElements(config.element);
            that._active = getActiveIndex(that._elements["tab"]);

            if (that._elements.tabpanel) {
                refreshActive();
                bindEvents();
                scrollToDeepLinkIdInTabs();
            }

            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Tabs component
                 * - if so, route the "navigate" operation to enact a navigation of the Tabs based on index data
                 */
                CQ.CoreComponents.MESSAGE_CHANNEL = CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-tabs" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            navigate(message.data.index);
                        }
                    }
                });
            }
        }

        /**
         * Displays the panel containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInTabs() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "tab", "tabpanel");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["tab"][deepLinkItemIdx];
                    if (deepLinkItem && that._elements["tab"][that._active].id !== deepLinkItem.id) {
                        navigateAndFocusTab(deepLinkItemIdx, true);
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Returns the index of the active tab, if no tab is active returns 0
         *
         * @param {Array} tabs Tab elements
         * @returns {Number} Index of the active tab, 0 if none is active
         */
        function getActiveIndex(tabs) {
            if (tabs) {
                for (var i = 0; i < tabs.length; i++) {
                    if (tabs[i].classList.contains(selectors.active.tab)) {
                        return i;
                    }
                }
            }
            return 0;
        }

        /**
         * Caches the Tabs elements as defined via the {@code data-tabs-hook="ELEMENT_NAME"} markup API
         *
         * @private
         * @param {HTMLElement} wrapper The Tabs wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                if (hook.closest("." + NS + "-" + IS) === that._elements.self) { // only process own tab elements
                    var capitalized = IS;
                    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                    var key = hook.dataset[NS + "Hook" + capitalized];
                    if (that._elements[key]) {
                        if (!Array.isArray(that._elements[key])) {
                            var tmp = that._elements[key];
                            that._elements[key] = [tmp];
                        }
                        that._elements[key].push(hook);
                    } else {
                        that._elements[key] = hook;
                    }
                }
            }
        }

        /**
         * Binds Tabs event handling
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInTabs, false);
            var tabs = that._elements["tab"];
            if (tabs) {
                for (var i = 0; i < tabs.length; i++) {
                    (function(index) {
                        tabs[i].addEventListener("click", function(event) {
                            navigateAndFocusTab(index);
                        });
                        tabs[i].addEventListener("keydown", function(event) {
                            onKeyDown(event);
                        });
                    })(i);
                }
            }
        }

        /**
         * Handles tab keydown events
         *
         * @private
         * @param {Object} event The keydown event
         */
        function onKeyDown(event) {
            var index = that._active;
            var lastIndex = that._elements["tab"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        navigateAndFocusTab(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        navigateAndFocusTab(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    navigateAndFocusTab(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    navigateAndFocusTab(lastIndex);
                    break;
                default:
                    return;
            }
        }

        /**
         * Refreshes the tab markup based on the current {@code Tabs#_active} index
         *
         * @private
         */
        function refreshActive() {
            var tabpanels = that._elements["tabpanel"];
            var tabs = that._elements["tab"];

            if (tabpanels) {
                if (Array.isArray(tabpanels)) {
                    for (var i = 0; i < tabpanels.length; i++) {
                        if (i === parseInt(that._active)) {
                            tabpanels[i].classList.add(selectors.active.tabpanel);
                            tabpanels[i].removeAttribute("aria-hidden");
                            tabs[i].classList.add(selectors.active.tab);
                            tabs[i].setAttribute("aria-selected", true);
                            tabs[i].setAttribute("tabindex", "0");
                        } else {
                            tabpanels[i].classList.remove(selectors.active.tabpanel);
                            tabpanels[i].setAttribute("aria-hidden", true);
                            tabs[i].classList.remove(selectors.active.tab);
                            tabs[i].setAttribute("aria-selected", false);
                            tabs[i].setAttribute("tabindex", "-1");
                        }
                    }
                } else {
                    // only one tab
                    tabpanels.classList.add(selectors.active.tabpanel);
                    tabs.classList.add(selectors.active.tab);
                }
            }
        }

        /**
         * Focuses the element and prevents scrolling the element into view
         *
         * @param {HTMLElement} element Element to focus
         */
        function focusWithoutScroll(element) {
            var x = window.scrollX || window.pageXOffset;
            var y = window.scrollY || window.pageYOffset;
            element.focus();
            window.scrollTo(x, y);
        }

        /**
         * Navigates to the tab at the provided index
         *
         * @private
         * @param {Number} index The index of the tab to navigate to
         */
        function navigate(index) {
            that._active = index;
            refreshActive();
        }

        /**
         * Navigates to the item at the provided index and ensures the active tab gains focus
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigateAndFocusTab(index, keepHash) {
            var exActive = that._active;
            if (!keepHash && containerUtils) {
                containerUtils.updateUrlHash(that, "tab", index);
            }
            navigate(index);
            focusWithoutScroll(that._elements["tab"][index]);

            if (dataLayerEnabled) {

                var activeItem = getDataLayerId(that._elements.tabpanel[index]);
                var exActiveItem = getDataLayerId(that._elements.tabpanel[exActive]);

                dataLayer.push({
                    event: "cmp:show",
                    eventInfo: {
                        path: "component." + activeItem
                    }
                });

                dataLayer.push({
                    event: "cmp:hide",
                    eventInfo: {
                        path: "component." + exActiveItem
                    }
                });

                var tabsId = that._elements.self.id;
                var uploadPayload = { component: {} };
                uploadPayload.component[tabsId] = { shownItems: [activeItem] };

                var removePayload = { component: {} };
                removePayload.component[tabsId] = { shownItems: undefined };

                dataLayer.push(removePayload);
                dataLayer.push(uploadPayload);
            }
        }
    }

    /**
     * Reads options data from the Tabs wrapper element, defined via {@code data-cmp-*} data attributes
     *
     * @private
     * @param {HTMLElement} element The Tabs element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Tabs components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Tabs({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Tabs({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function(document) {
    "use strict";

    window.CMP = window.CMP || {};
    window.CMP.utils = (function() {
        var NS = "cmp";

        /**
         * Reads options data from the Component wrapper element, defined via {@code data-cmp-*} data attributes
         *
         * @param {HTMLElement} element The component element to read options data from
         * @param {String} is The component identifier
         * @returns {String[]} The options read from the component data attributes
         */
        var readData = function(element, is) {
            var data = element.dataset;
            var options = [];
            var capitalized = is;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var reserved = ["is", "hook" + capitalized];

            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    var value = data[key];

                    if (key.indexOf(NS) === 0) {
                        key = key.slice(NS.length);
                        key = key.charAt(0).toLowerCase() + key.substring(1);

                        if (reserved.indexOf(key) === -1) {
                            options[key] = value;
                        }
                    }
                }
            }
            return options;
        };

        /**
         * Set up the final properties of a component by evaluating the transform function or fall back to the default value on demand
         * @param {String[]} options the options to transform
         * @param {Object} properties object of properties of property functions
         * @returns {Object} transformed properties
         */
        var setupProperties = function(options, properties) {
            var transformedProperties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    if (options && options[key] != null) {
                        if (property && typeof property.transform === "function") {
                            transformedProperties[key] = property.transform(options[key]);
                        } else {
                            transformedProperties[key] = options[key];
                        }
                    } else {
                        transformedProperties[key] = properties[key]["default"];
                    }
                }
            }
            return transformedProperties;
        };


        return {
            readData: readData,
            setupProperties: setupProperties
        };
    }());
}(window.document));

/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var containerUtils = window.CQ && window.CQ.CoreComponents && window.CQ.CoreComponents.container && window.CQ.CoreComponents.container.utils ? window.CQ.CoreComponents.container.utils : undefined;
    if (!containerUtils) {
        // eslint-disable-next-line no-console
        console.warn("Tabs: container utilities at window.CQ.CoreComponents.container.utils are not available. This can lead to missing features. Ensure the core.wcm.components.commons.site.container client library is included on the page.");
    }
    var dataLayerEnabled;
    var dataLayer;

    var NS = "cmp";
    var IS = "carousel";

    var keyCodes = {
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var properties = {
        /**
         * Determines whether the Carousel will automatically transition between slides
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autoplay": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * Duration (in milliseconds) before automatically transitioning to the next slide
         *
         * @memberof Carousel
         * @type {Number}
         * @default 5000
         */
        "delay": {
            "default": 5000,
            "transform": function(value) {
                value = parseFloat(value);
                return !isNaN(value) ? value : null;
            }
        },
        /**
         * Determines whether automatic pause on hovering the carousel is disabled
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autopauseDisabled": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Carousel Configuration
     *
     * @typedef {Object} CarouselConfig Represents a Carousel configuration
     * @property {HTMLElement} element The HTMLElement representing the Carousel
     * @property {*[]} options The Carousel options
     */

    /**
     * Carousel
     *
     * @class Carousel
     * @classdesc An interactive Carousel component for navigating a list of generic items
     * @param {CarouselConfig} config The Carousel configuration
     */
    function Carousel(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Carousel
         *
         * @private
         * @param {CarouselConfig} config The Carousel configuration
         */
        function init(config) {
            that._config = config;

            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            that._active = 0;
            that._paused = false;

            if (that._elements.item) {
                initializeActive();
                bindEvents();
                resetAutoplayInterval();
                refreshPlayPauseActions();
                scrollToDeepLinkIdInCarousel();
            }

            // TODO: This section is only relevant in edit mode and should move to the editor clientLib
            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Carousel component
                 * - if so, route the "navigate" operation to enact a navigation of the Carousel based on index data
                 */
                window.CQ = window.CQ || {};
                window.CQ.CoreComponents = window.CQ.CoreComponents || {};
                window.CQ.CoreComponents.MESSAGE_CHANNEL = window.CQ.CoreComponents.MESSAGE_CHANNEL || new window.Granite.author.MessageChannel("cqauthor", window);
                window.CQ.CoreComponents.MESSAGE_CHANNEL.subscribeRequestMessage("cmp.panelcontainer", function(message) {
                    if (message.data && message.data.type === "cmp-carousel" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            navigate(message.data.index);
                        }
                    }
                });
            }
        }

        /**
         * Displays the slide containing the element that corresponds to the deep link in the URI fragment
         * and scrolls the browser to this element.
         */
        function scrollToDeepLinkIdInCarousel() {
            if (containerUtils) {
                var deepLinkItemIdx = containerUtils.getDeepLinkItemIdx(that, "item", "item");
                if (deepLinkItemIdx > -1) {
                    var deepLinkItem = that._elements["item"][deepLinkItemIdx];
                    if (deepLinkItem && that._elements["item"][that._active].id !== deepLinkItem.id) {
                        navigateAndFocusIndicator(deepLinkItemIdx, true);
                        // pause the carousel auto-rotation
                        pause();
                    }
                    var hashId = window.location.hash.substring(1);
                    if (hashId) {
                        var hashItem = document.querySelector("[id='" + hashId + "']");
                        if (hashItem) {
                            hashItem.scrollIntoView();
                        }
                    }
                }
            }
        }

        /**
         * Caches the Carousel elements as defined via the {@code data-carousel-hook="ELEMENT_NAME"} markup API
         *
         * @private
         * @param {HTMLElement} wrapper The Carousel wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                var capitalized = IS;
                capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                var key = hook.dataset[NS + "Hook" + capitalized];
                if (that._elements[key]) {
                    if (!Array.isArray(that._elements[key])) {
                        var tmp = that._elements[key];
                        that._elements[key] = [tmp];
                    }
                    that._elements[key].push(hook);
                } else {
                    that._elements[key] = hook;
                }
            }
        }

        /**
         * Sets up properties for the Carousel based on the passed options.
         *
         * @private
         * @param {Object} options The Carousel options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Carousel event handling
         *
         * @private
         */
        function bindEvents() {
            window.addEventListener("hashchange", scrollToDeepLinkIdInCarousel, false);
            if (that._elements["previous"]) {
                that._elements["previous"].addEventListener("click", function() {
                    var index = getPreviousIndex();
                    navigate(index);
                    if (dataLayerEnabled) {
                        dataLayer.push({
                            event: "cmp:show",
                            eventInfo: {
                                path: "component." + getDataLayerId(that._elements.item[index])
                            }
                        });
                    }
                });
            }

            if (that._elements["next"]) {
                that._elements["next"].addEventListener("click", function() {
                    var index = getNextIndex();
                    navigate(index);
                    if (dataLayerEnabled) {
                        dataLayer.push({
                            event: "cmp:show",
                            eventInfo: {
                                path: "component." + getDataLayerId(that._elements.item[index])
                            }
                        });
                    }
                });
            }

            var indicators = that._elements["indicator"];
            if (indicators) {
                for (var i = 0; i < indicators.length; i++) {
                    (function(index) {
                        indicators[i].addEventListener("click", function(event) {
                            navigateAndFocusIndicator(index);
                            // pause the carousel auto-rotation
                            pause();
                        });
                    })(i);
                }
            }

            if (that._elements["pause"]) {
                if (that._properties.autoplay) {
                    that._elements["pause"].addEventListener("click", onPauseClick);
                }
            }

            if (that._elements["play"]) {
                if (that._properties.autoplay) {
                    that._elements["play"].addEventListener("click", onPlayClick);
                }
            }

            that._elements.self.addEventListener("keydown", onKeyDown);

            if (!that._properties.autopauseDisabled) {
                that._elements.self.addEventListener("mouseenter", onMouseEnter);
                that._elements.self.addEventListener("mouseleave", onMouseLeave);
            }

            // for accessibility we pause animation when a element get focused
            var items = that._elements["item"];
            if (items) {
                for (var j = 0; j < items.length; j++) {
                    items[j].addEventListener("focusin", onMouseEnter);
                    items[j].addEventListener("focusout", onMouseLeave);
                }
            }
        }

        /**
         * Handles carousel keydown events
         *
         * @private
         * @param {Object} event The keydown event
         */
        function onKeyDown(event) {
            var index = that._active;
            var lastIndex = that._elements["indicator"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        navigateAndFocusIndicator(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        navigateAndFocusIndicator(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    navigateAndFocusIndicator(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    navigateAndFocusIndicator(lastIndex);
                    break;
                case keyCodes.SPACE:
                    if (that._properties.autoplay && (event.target !== that._elements["previous"] && event.target !== that._elements["next"])) {
                        event.preventDefault();
                        if (!that._paused) {
                            pause();
                        } else {
                            play();
                        }
                    }
                    if (event.target === that._elements["pause"]) {
                        that._elements["play"].focus();
                    }
                    if (event.target === that._elements["play"]) {
                        that._elements["pause"].focus();
                    }
                    break;
                default:
                    return;
            }
        }

        /**
         * Handles carousel mouseenter events
         *
         * @private
         * @param {Object} event The mouseenter event
         */
        function onMouseEnter(event) {
            clearAutoplayInterval();
        }

        /**
         * Handles carousel mouseleave events
         *
         * @private
         * @param {Object} event The mouseleave event
         */
        function onMouseLeave(event) {
            resetAutoplayInterval();
        }

        /**
         * Handles pause element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPauseClick(event) {
            pause();
            that._elements["play"].focus();
        }

        /**
         * Handles play element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPlayClick() {
            play();
            that._elements["pause"].focus();
        }

        /**
         * Pauses the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function pause() {
            that._paused = true;
            clearAutoplayInterval();
            refreshPlayPauseActions();
        }

        /**
         * Enables the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function play() {
            that._paused = false;

            // If the Carousel is hovered, don't begin auto transitioning until the next mouse leave event
            var hovered = false;
            if (that._elements.self.parentElement) {
                hovered = that._elements.self.parentElement.querySelector(":hover") === that._elements.self;
            }
            if (that._properties.autopauseDisabled || !hovered) {
                resetAutoplayInterval();
            }

            refreshPlayPauseActions();
        }

        /**
         * Refreshes the play/pause action markup based on the {@code Carousel#_paused} state
         *
         * @private
         */
        function refreshPlayPauseActions() {
            setActionDisabled(that._elements["pause"], that._paused);
            setActionDisabled(that._elements["play"], !that._paused);
        }

        /**
         * Initialize {@code Carousel#_active} based on the active item of the carousel.
         */
        function initializeActive() {
            var items = that._elements["item"];
            if (items && Array.isArray(items)) {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].classList.contains("cmp-carousel__item--active")) {
                        that._active = i;
                        break;
                    }
                }
            }
        }

        /**
         * Refreshes the item markup based on the current {@code Carousel#_active} index
         *
         * @private
         */
        function refreshActive() {
            var items = that._elements["item"];
            var indicators = that._elements["indicator"];

            if (items) {
                if (Array.isArray(items)) {
                    for (var i = 0; i < items.length; i++) {
                        if (i === parseInt(that._active)) {
                            items[i].classList.add("cmp-carousel__item--active");
                            items[i].removeAttribute("aria-hidden");
                            indicators[i].classList.add("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", true);
                            indicators[i].setAttribute("tabindex", "0");
                        } else {
                            items[i].classList.remove("cmp-carousel__item--active");
                            items[i].setAttribute("aria-hidden", true);
                            indicators[i].classList.remove("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", false);
                            indicators[i].setAttribute("tabindex", "-1");
                        }
                    }
                } else {
                    // only one item
                    items.classList.add("cmp-carousel__item--active");
                    indicators.classList.add("cmp-carousel__indicator--active");
                }
            }
        }

        /**
         * Focuses the element and prevents scrolling the element into view
         *
         * @param {HTMLElement} element Element to focus
         */
        function focusWithoutScroll(element) {
            var x = window.scrollX || window.pageXOffset;
            var y = window.scrollY || window.pageYOffset;
            element.focus();
            window.scrollTo(x, y);
        }

        /**
         * Retrieves the next active index, with looping
         *
         * @private
         * @returns {Number} Index of the next carousel item
         */
        function getNextIndex() {
            return that._active === (that._elements["item"].length - 1) ? 0 : that._active + 1;
        }

        /**
         * Retrieves the previous active index, with looping
         *
         * @private
         * @returns {Number} Index of the previous carousel item
         */
        function getPreviousIndex() {
            return that._active === 0 ? (that._elements["item"].length - 1) : that._active - 1;
        }

        /**
         * Navigates to the item at the provided index
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigate(index, keepHash) {
            if (index < 0 || index > (that._elements["item"].length - 1)) {
                return;
            }

            that._active = index;
            refreshActive();

            if (!keepHash && containerUtils) {
                containerUtils.updateUrlHash(that, "item", index);
            }

            if (dataLayerEnabled) {
                var carouselId = that._elements.self.id;
                var activeItem = getDataLayerId(that._elements.item[index]);
                var updatePayload = { component: {} };
                updatePayload.component[carouselId] = { shownItems: [activeItem] };

                var removePayload = { component: {} };
                removePayload.component[carouselId] = { shownItems: undefined };

                dataLayer.push(removePayload);
                dataLayer.push(updatePayload);
            }

            // reset the autoplay transition interval following navigation, if not already hovering the carousel
            if (that._elements.self.parentElement) {
                if (that._elements.self.parentElement.querySelector(":hover") !== that._elements.self) {
                    resetAutoplayInterval();
                }
            }
        }

        /**
         * Navigates to the item at the provided index and ensures the active indicator gains focus
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         * @param {Boolean} keepHash true to keep the hash in the URL, false to update it
         */
        function navigateAndFocusIndicator(index, keepHash) {
            navigate(index, keepHash);
            focusWithoutScroll(that._elements["indicator"][index]);

            if (dataLayerEnabled) {
                dataLayer.push({
                    event: "cmp:show",
                    eventInfo: {
                        path: "component." + getDataLayerId(that._elements.item[index])
                    }
                });
            }
        }

        /**
         * Starts/resets automatic slide transition interval
         *
         * @private
         */
        function resetAutoplayInterval() {
            if (that._paused || !that._properties.autoplay) {
                return;
            }
            clearAutoplayInterval();
            that._autoplayIntervalId = window.setInterval(function() {
                if (document.visibilityState && document.hidden) {
                    return;
                }
                var indicators = that._elements["indicators"];
                if (indicators !== document.activeElement && indicators.contains(document.activeElement)) {
                    // if an indicator has focus, ensure we switch focus following navigation
                    navigateAndFocusIndicator(getNextIndex(), true);
                } else {
                    navigate(getNextIndex(), true);
                }
            }, that._properties.delay);
        }

        /**
         * Clears/pauses automatic slide transition interval
         *
         * @private
         */
        function clearAutoplayInterval() {
            window.clearInterval(that._autoplayIntervalId);
            that._autoplayIntervalId = null;
        }

        /**
         * Sets the disabled state for an action and toggles the appropriate CSS classes
         *
         * @private
         * @param {HTMLElement} action Action to disable
         * @param {Boolean} [disable] {@code true} to disable, {@code false} to enable
         */
        function setActionDisabled(action, disable) {
            if (!action) {
                return;
            }
            if (disable !== false) {
                action.disabled = true;
                action.classList.add("cmp-carousel__action--disabled");
            } else {
                action.disabled = false;
                action.classList.remove("cmp-carousel__action--disabled");
            }
        }
    }

    /**
     * Parses the dataLayer string and returns the ID
     *
     * @private
     * @param {HTMLElement} item the accordion item
     * @returns {String} dataLayerId or undefined
     */
    function getDataLayerId(item) {
        if (item) {
            if (item.dataset.cmpDataLayer) {
                return Object.keys(JSON.parse(item.dataset.cmpDataLayer))[0];
            } else {
                return item.id;
            }
        }
        return null;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Carousel components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Carousel({ element: elements[i], options: CMP.utils.readData(elements[i], IS) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Carousel({ element: element, options: CMP.utils.readData(element, IS) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    var documentReady = document.readyState !== "loading" ? Promise.resolve() : new Promise(function(resolve) {
        document.addEventListener("DOMContentLoaded", resolve);
    });
    Promise.all([documentReady]).then(onDocumentReady);

    if (containerUtils) {
        window.addEventListener("load", containerUtils.scrollToAnchor, false);
    }

}());

/*******************************************************************************
 * Copyright 2017 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
if (window.Element && !Element.prototype.closest) {
    // eslint valid-jsdoc: "off"
    Element.prototype.closest =
        function(s) {
            "use strict";
            var matches = (this.document || this.ownerDocument).querySelectorAll(s);
            var el      = this;
            var i;
            do {
                i = matches.length;
                while (--i >= 0 && matches.item(i) !== el) {
                    // continue
                }
            } while ((i < 0) && (el = el.parentElement));
            return el;
        };
}

if (window.Element && !Element.prototype.matches) {
    Element.prototype.matches =
        Element.prototype.matchesSelector ||
        Element.prototype.mozMatchesSelector ||
        Element.prototype.msMatchesSelector ||
        Element.prototype.oMatchesSelector ||
        Element.prototype.webkitMatchesSelector ||
        function(s) {
            "use strict";
            var matches = (this.document || this.ownerDocument).querySelectorAll(s);
            var i       = matches.length;
            while (--i >= 0 && matches.item(i) !== this) {
                // continue
            }
            return i > -1;
        };
}

if (!Object.assign) {
    Object.assign = function(target, varArgs) { // .length of function is 2
        "use strict";
        if (target === null) {
            throw new TypeError("Cannot convert undefined or null to object");
        }

        var to = Object(target);

        for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];

            if (nextSource !== null) {
                for (var nextKey in nextSource) {
                    if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                        to[nextKey] = nextSource[nextKey];
                    }
                }
            }
        }
        return to;
    };
}

(function(arr) {
    "use strict";
    arr.forEach(function(item) {
        if (Object.prototype.hasOwnProperty.call(item, "remove")) {
            return;
        }
        Object.defineProperty(item, "remove", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: function remove() {
                this.parentNode.removeChild(this);
            }
        });
    });
})([Element.prototype, CharacterData.prototype, DocumentType.prototype]);

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function(document) {
    "use strict";

    window.CMP = window.CMP || {};
    window.CMP.utils = (function() {
        var NS = "cmp";

        /**
         * Reads options data from the Component wrapper element, defined via {@code data-cmp-*} data attributes
         *
         * @param {HTMLElement} element The component element to read options data from
         * @param {String} is The component identifier
         * @returns {String[]} The options read from the component data attributes
         */
        var readData = function(element, is) {
            var data = element.dataset;
            var options = [];
            var capitalized = is;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var reserved = ["is", "hook" + capitalized];

            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    var value = data[key];

                    if (key.indexOf(NS) === 0) {
                        key = key.slice(NS.length);
                        key = key.charAt(0).toLowerCase() + key.substring(1);

                        if (reserved.indexOf(key) === -1) {
                            options[key] = value;
                        }
                    }
                }
            }
            return options;
        };

        /**
         * Set up the final properties of a component by evaluating the transform function or fall back to the default value on demand
         * @param {String[]} options the options to transform
         * @param {Object} properties object of properties of property functions
         * @returns {Object} transformed properties
         */
        var setupProperties = function(options, properties) {
            var transformedProperties = {};

            for (var key in properties) {
                if (Object.prototype.hasOwnProperty.call(properties, key)) {
                    var property = properties[key];
                    if (options && options[key] != null) {
                        if (property && typeof property.transform === "function") {
                            transformedProperties[key] = property.transform(options[key]);
                        } else {
                            transformedProperties[key] = options[key];
                        }
                    } else {
                        transformedProperties[key] = properties[key]["default"];
                    }
                }
            }
            return transformedProperties;
        };


        return {
            readData: readData,
            setupProperties: setupProperties
        };
    }());
}(window.document));

/*******************************************************************************
 * Copyright 2022 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function(document) {
    "use strict";

    window.CMP = window.CMP || {};
    window.CMP.image = window.CMP.image || {};
    window.CMP.image.dynamicMedia = (function() {
        var autoSmartCrops = {};
        var SRC_URI_TEMPLATE_WIDTH_VAR = "{.width}";
        var SRC_URI_TEMPLATE_DPR_VAR = "{dpr}";
        var SRC_URI_DPR_OFF = "dpr=off";
        var SRC_URI_DPR_ON = "dpr=on,{dpr}";
        var dpr = window.devicePixelRatio || 1;
        var config = {
            minWidth: 20
        };

        /**
         * get auto smart crops from dm
         * @param {String} src the src uri
         * @returns {{}} the smart crop json object
         */
        var getAutoSmartCrops = function(src) {
            var request = new XMLHttpRequest();
            var url = src.split(SRC_URI_TEMPLATE_WIDTH_VAR)[0] + "?req=set,json";
            request.open("GET", url, false);
            request.onload = function() {
                if (request.status >= 200 && request.status < 400) {
                    // success status
                    var responseText = request.responseText;
                    var rePayload = new RegExp(/^(?:\/\*jsonp\*\/)?\s*([^()]+)\(([\s\S]+),\s*"[0-9]*"\);?$/gmi);
                    var rePayloadJSON = new RegExp(/^{[\s\S]*}$/gmi);
                    var resPayload = rePayload.exec(responseText);
                    var payload;
                    if (resPayload) {
                        var payloadStr = resPayload[2];
                        if (rePayloadJSON.test(payloadStr)) {
                            payload = JSON.parse(payloadStr);
                        }

                    }
                    // check "relation" - only in case of smartcrop preset
                    if (payload && payload.set.relation && payload.set.relation.length > 0) {
                        for (var i = 0; i < payload.set.relation.length; i++) {
                            autoSmartCrops[parseInt(payload.set.relation[i].userdata.SmartCropWidth)] =
                                ":" + payload.set.relation[i].userdata.SmartCropDef;
                        }
                    }
                } else {
                    // error status
                }
            };
            request.send();
            return autoSmartCrops;
        };

        /**
         * Build and return the srcset value based on the available auto smart crops
         * @param {String} src the src uri
         * @param {Object} smartCrops the smart crops object
         * @returns {String} the srcset
         */
        var getSrcSet = function(src, smartCrops) {
            var srcset;
            var keys = Object.keys(smartCrops);
            if (keys.length > 0) {
                srcset = [];
                for (var key in autoSmartCrops) {
                    srcset.push(src.replace(SRC_URI_TEMPLATE_WIDTH_VAR, smartCrops[key]) + " " + key + "w");
                }
            }
            return  srcset.join(",");
        };

        /**
         * Get the optimal width based on the available sizes
         * @param {[Number]} sizes the available sizes
         * @param {Number} width the element width
         * @returns {String} the optimal width
         */
        function getOptimalWidth(sizes, width) {
            var len = sizes.length;
            var key = 0;

            while ((key < len - 1) && (sizes[key] < width)) {
                key++;
            }

            return sizes[key] !== undefined ? sizes[key].toString() : width;
        }

        /**
         * Get the width of an element or parent element if the width is smaller than the minimum width
         * @param {HTMLElement} component the image component
         * @param {HTMLElement | Node} parent the parent element
         * @returns {Number} the width of the element
         */
        var getWidth = function(component, parent) {
            var width = component.offsetWidth;
            while (width < config.minWidth && parent && !component._autoWidth) {
                width =  parent.offsetWidth;
                parent = parent.parentNode;
            }
            return width;
        };

        /**
         * Set the src and srcset attribute for a Dynamic Media Image which auto smart crops enabled.
         * @param {HTMLElement} component the image component
         * @param {{}} properties the component properties
         */
        var setDMAttributes = function(component, properties) {
            // for v3 we first have to turn the dpr on
            var src = properties.src.replace(SRC_URI_DPR_OFF, SRC_URI_DPR_ON);
            src = src.replace(SRC_URI_TEMPLATE_DPR_VAR, dpr);
            var smartCrops = {};
            var width;
            if (properties["smartcroprendition"] === "SmartCrop:Auto") {
                smartCrops = getAutoSmartCrops(src);
            }
            var hasWidths = (properties.widths && properties.widths.length > 0) || Object.keys(smartCrops).length > 0;
            if (hasWidths) {
                var image = component.querySelector("img");
                var elemWidth = getWidth(component, component.parentNode);
                if (properties["smartcroprendition"] === "SmartCrop:Auto") {
                    image.setAttribute("srcset", CMP.image.dynamicMedia.getSrcSet(src, smartCrops));
                    width = getOptimalWidth(Object.keys(smartCrops, elemWidth));
                    image.setAttribute("src", CMP.image.dynamicMedia.getSrc(src, smartCrops[width]));
                } else {
                    width = getOptimalWidth(properties.widths, elemWidth);
                    image.setAttribute("src", CMP.image.dynamicMedia.getSrc(src, width));
                }
            }
        };

        /**
         * Get the src attribute based on the optimal width
         * @param {String} src the src uri
         * @param {String} width the element width
         * @returns {String} the final src attribute
         */
        var getSrc = function(src, width) {
            if (src.indexOf(SRC_URI_TEMPLATE_WIDTH_VAR) > -1) {
                src = src.replace(SRC_URI_TEMPLATE_WIDTH_VAR, width);
            }
            return src;
        };


        return {
            getAutoSmartCrops: getAutoSmartCrops,
            getSrcSet: getSrcSet,
            getSrc: getSrc,
            setDMAttributes: setDMAttributes,
            getWidth: getWidth
        };
    }());
    document.dispatchEvent(new CustomEvent("core.wcm.components.commons.site.image.dynamic-media.loaded"));
}(window.document));

/*******************************************************************************
 * Copyright 2016 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "image";

    var EMPTY_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    var LAZY_THRESHOLD_DEFAULT = 0;
    var SRC_URI_TEMPLATE_WIDTH_VAR = "{.width}";
    var SRC_URI_TEMPLATE_WIDTH_VAR_ASSET_DELIVERY = "width={width}";
    var SRC_URI_TEMPLATE_DPR_VAR = "{dpr}";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        image: '[data-cmp-hook-image="image"]',
        map: '[data-cmp-hook-image="map"]',
        area: '[data-cmp-hook-image="area"]'
    };

    var lazyLoader = {
        "cssClass": "cmp-image__image--is-loading",
        "style": {
            "height": 0,
            "padding-bottom": "" // will be replaced with % ratio
        }
    };

    var properties = {
        /**
         * An array of alternative image widths (in pixels).
         * Used to replace a {.width} variable in the src property with an optimal width if a URI template is provided.
         *
         * @memberof Image
         * @type {Number[]}
         * @default []
         */
        "widths": {
            "default": [],
            "transform": function(value) {
                var widths = [];
                value.split(",").forEach(function(item) {
                    item = parseFloat(item);
                    if (!isNaN(item)) {
                        widths.push(item);
                    }
                });
                return widths;
            }
        },
        /**
         * Indicates whether the image should be rendered lazily.
         *
         * @memberof Image
         * @type {Boolean}
         * @default false
         */
        "lazy": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * Indicates image is DynamicMedia image.
         *
         * @memberof Image
         * @type {Boolean}
         * @default false
         */
        "dmimage": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * The lazy threshold.
         * This is the number of pixels, in advance of becoming visible, when an lazy-loading image should begin
         * to load.
         *
         * @memberof Image
         * @type {Number}
         * @default 0
         */
        "lazythreshold": {
            "default": 0,
            "transform": function(value) {
                var val =  parseInt(value);
                if (isNaN(val)) {
                    return LAZY_THRESHOLD_DEFAULT;
                }
                return val;
            }
        },
        /**
         * The image source.
         *
         * Can be a simple image source, or a URI template representation that
         * can be variable expanded - useful for building an image configuration with an alternative width.
         * e.g. '/path/image.coreimg{.width}.jpeg/1506620954214.jpeg'
         *
         * @memberof Image
         * @type {String}
         */
        "src": {
            "transform": function(value) {
                return decodeURIComponent(value);
            }
        }
    };

    var devicePixelRatio = window.devicePixelRatio || 1;

    function Image(config) {
        var that = this;

        var smartCrops = {};

        var useAssetDelivery = false;
        var srcUriTemplateWidthVar = SRC_URI_TEMPLATE_WIDTH_VAR;

        function init(config) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            // check if asset delivery is used
            if (config.options.src && config.options.src.indexOf(SRC_URI_TEMPLATE_WIDTH_VAR_ASSET_DELIVERY) >= 0) {
                useAssetDelivery = true;
                srcUriTemplateWidthVar = SRC_URI_TEMPLATE_WIDTH_VAR_ASSET_DELIVERY;
            }

            that._properties = CMP.utils.setupProperties(config.options, properties);
            cacheElements(config.element);
            // check image is DM asset; if true try to make req=set
            if (config.options.src && Object.prototype.hasOwnProperty.call(config.options, "dmimage") && (config.options["smartcroprendition"] === "SmartCrop:Auto")) {
                smartCrops = CMP.image.dynamicMedia.getAutoSmartCrops(config.options.src);
            }

            if (!that._elements.noscript) {
                return;
            }

            that._elements.container = that._elements.link ? that._elements.link : that._elements.self;

            unwrapNoScript();

            if (that._properties.lazy) {
                addLazyLoader();
            }

            if (that._elements.map) {
                that._elements.image.addEventListener("load", onLoad);
            }

            window.addEventListener("resize", onWindowResize);
            ["focus", "click", "load", "transitionend", "animationend", "scroll"].forEach(function(name) {
                document.addEventListener(name, that.update);
            });

            that._elements.image.addEventListener("cmp-image-redraw", that.update);

            that._interSectionObserver = new IntersectionObserver(function(entries, interSectionObserver) {
                entries.forEach(function(entry) {
                    if (entry.intersectionRatio > 0) {
                        that.update();
                    }
                });
            });
            that._interSectionObserver.observe(that._elements.self);

            that.update();
        }

        function loadImage() {
            var hasWidths = (that._properties.widths && that._properties.widths.length > 0) || Object.keys(smartCrops).length > 0;
            var replacement;
            if (Object.keys(smartCrops).length > 0) {
                var optimalWidth = getOptimalWidth(Object.keys(smartCrops), false);
                replacement = smartCrops[optimalWidth];
            } else {
                replacement = hasWidths ? (that._properties.dmimage ? "" : ".") + getOptimalWidth(that._properties.widths, true) : "";
            }
            if (useAssetDelivery) {
                replacement = replacement !== "" ? ("width=" + replacement.substring(1)) : "";
            }
            var url = that._properties.src.replace(srcUriTemplateWidthVar, replacement);
            url = url.replace(SRC_URI_TEMPLATE_DPR_VAR, devicePixelRatio);

            var imgSrcAttribute = that._elements.image.getAttribute("src");

            if (url !== imgSrcAttribute) {
                if (imgSrcAttribute === null || imgSrcAttribute === EMPTY_PIXEL) {
                    that._elements.image.setAttribute("src", url);
                } else {
                    var urlTemplateParts = that._properties.src.split(srcUriTemplateWidthVar);
                    // check if image src was dynamically swapped meanwhile (e.g. by Target)
                    var isImageRefSame = imgSrcAttribute.startsWith(urlTemplateParts[0]);
                    if (isImageRefSame && urlTemplateParts.length > 1) {
                        isImageRefSame = imgSrcAttribute.endsWith(urlTemplateParts[urlTemplateParts.length - 1]);
                    }
                    if (isImageRefSame) {
                        that._elements.image.setAttribute("src", url);
                        if (!hasWidths) {
                            window.removeEventListener("scroll", that.update);
                        }
                    }
                }
            }
            if (that._lazyLoaderShowing) {
                that._elements.image.addEventListener("load", removeLazyLoader);
            }
            that._interSectionObserver.unobserve(that._elements.self);
        }

        function getOptimalWidth(widths, useDevicePixelRatio) {
            var container = that._elements.self;
            var containerWidth = container.clientWidth;
            while (containerWidth === 0 && container.parentNode) {
                container = container.parentNode;
                containerWidth = container.clientWidth;
            }

            var dpr = useDevicePixelRatio ? devicePixelRatio : 1;
            var optimalWidth = containerWidth * dpr;
            var len = widths.length;
            var key = 0;

            while ((key < len - 1) && (widths[key] < optimalWidth)) {
                key++;
            }

            return widths[key].toString();
        }

        function addLazyLoader() {
            var width = that._elements.image.getAttribute("width");
            var height = that._elements.image.getAttribute("height");

            if (width && height) {
                var ratio = (height / width) * 100;
                var styles = lazyLoader.style;

                styles["padding-bottom"] = ratio + "%";

                for (var s in styles) {
                    if (Object.prototype.hasOwnProperty.call(styles, s)) {
                        that._elements.image.style[s] = styles[s];
                    }
                }
            }
            that._elements.image.setAttribute("src", EMPTY_PIXEL);
            that._elements.image.classList.add(lazyLoader.cssClass);
            that._lazyLoaderShowing = true;
        }

        function unwrapNoScript() {
            var markup = decodeNoscript(that._elements.noscript.textContent.trim());
            var parser = new DOMParser();

            // temporary document avoids requesting the image before removing its src
            var temporaryDocument = parser.parseFromString(markup, "text/html");
            var imageElement = temporaryDocument.querySelector(selectors.image);
            imageElement.removeAttribute("src");
            that._elements.container.insertBefore(imageElement, that._elements.noscript);

            var mapElement = temporaryDocument.querySelector(selectors.map);
            if (mapElement) {
                that._elements.container.insertBefore(mapElement, that._elements.noscript);
            }

            that._elements.noscript.parentNode.removeChild(that._elements.noscript);
            if (that._elements.container.matches(selectors.image)) {
                that._elements.image = that._elements.container;
            } else {
                that._elements.image = that._elements.container.querySelector(selectors.image);
            }

            that._elements.map = that._elements.container.querySelector(selectors.map);
            that._elements.areas = that._elements.container.querySelectorAll(selectors.area);
        }

        function removeLazyLoader() {
            that._elements.image.classList.remove(lazyLoader.cssClass);
            for (var property in lazyLoader.style) {
                if (Object.prototype.hasOwnProperty.call(lazyLoader.style, property)) {
                    that._elements.image.style[property] = "";
                }
            }
            that._elements.image.removeEventListener("load", removeLazyLoader);
            that._lazyLoaderShowing = false;
        }

        function isLazyVisible() {
            if (that._elements.container.offsetParent === null) {
                return false;
            }

            var wt = window.pageYOffset;
            var wb = wt + document.documentElement.clientHeight;
            var et = that._elements.container.getBoundingClientRect().top + wt;
            var eb = et + that._elements.container.clientHeight;

            return eb >= wt - that._properties.lazythreshold && et <= wb + that._properties.lazythreshold;
        }

        function resizeAreas() {
            if (that._elements.areas && that._elements.areas.length > 0) {
                for (var i = 0; i < that._elements.areas.length; i++) {
                    var width = that._elements.image.width;
                    var height = that._elements.image.height;

                    if (width && height) {
                        var relcoords = that._elements.areas[i].dataset.cmpRelcoords;
                        if (relcoords) {
                            var relativeCoordinates = relcoords.split(",");
                            var coordinates = new Array(relativeCoordinates.length);

                            for (var j = 0; j < coordinates.length; j++) {
                                if (j % 2 === 0) {
                                    coordinates[j] = parseInt(relativeCoordinates[j] * width);
                                } else {
                                    coordinates[j] = parseInt(relativeCoordinates[j] * height);
                                }
                            }

                            that._elements.areas[i].coords = coordinates;
                        }
                    }
                }
            }
        }

        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                var capitalized = IS;
                capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                var key = hook.dataset[NS + "Hook" + capitalized];
                that._elements[key] = hook;
            }
        }

        function onWindowResize() {
            that.update();
            resizeAreas();
        }

        function onLoad() {
            resizeAreas();
        }

        that.update = function() {
            if (that._properties.lazy) {
                if (isLazyVisible()) {
                    loadImage();
                }
            } else {
                loadImage();
            }
        };

        if (config && config.element) {
            init(config);
        }
    }

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Image({ element: elements[i], options: CMP.utils.readData(elements[i], IS) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body             = document.querySelector("body");
        var observer         = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Image({ element: element, options: CMP.utils.readData(element, IS) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    var documentReady = document.readyState !== "loading" ? Promise.resolve() : new Promise(function(resolve) {
        document.addEventListener("DOMContentLoaded", resolve);
    });

    Promise.all([documentReady]).then(onDocumentReady);
    /*
        on drag & drop of the component into a parsys, noscript's content will be escaped multiple times by the editor which creates
        the DOM for editing; the HTML parser cannot be used here due to the multiple escaping
     */
    function decodeNoscript(text) {
        text = text.replace(/&(amp;)*lt;/g, "<");
        text = text.replace(/&(amp;)*gt;/g, ">");
        return text;
    }

})();

/*******************************************************************************
 * Copyright 2017 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "search";

    var DELAY = 300; // time before fetching new results when the user is typing a search string
    var LOADING_DISPLAY_DELAY = 300; // minimum time during which the loading indicator is displayed
    var PARAM_RESULTS_OFFSET = "resultsOffset";

    var keyCodes = {
        TAB: 9,
        ENTER: 13,
        ESCAPE: 27,
        ARROW_UP: 38,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        item: {
            self: "[data-" + NS + "-hook-" + IS + '="item"]',
            title: "[data-" + NS + "-hook-" + IS + '="itemTitle"]',
            focused: "." + NS + "-search__item--is-focused"
        }
    };

    var properties = {
        /**
         * The minimum required length of the search term before results are fetched.
         *
         * @memberof Search
         * @type {Number}
         * @default 3
         */
        minLength: {
            "default": 3,
            transform: function(value) {
                value = parseFloat(value);
                return isNaN(value) ? null : value;
            }
        },
        /**
         * The maximal number of results fetched by a search request.
         *
         * @memberof Search
         * @type {Number}
         * @default 10
         */
        resultsSize: {
            "default": 10,
            transform: function(value) {
                value = parseFloat(value);
                return isNaN(value) ? null : value;
            }
        }
    };

    var idCount = 0;

    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    function toggleShow(element, show) {
        if (element) {
            if (show !== false) {
                element.style.display = "block";
                element.setAttribute("aria-hidden", false);
            } else {
                element.style.display = "none";
                element.setAttribute("aria-hidden", true);
            }
        }
    }

    function serialize(form) {
        var query = [];
        if (form && form.elements) {
            for (var i = 0; i < form.elements.length; i++) {
                var node = form.elements[i];
                if (!node.disabled && node.name) {
                    var param = [node.name, encodeURIComponent(node.value)];
                    query.push(param.join("="));
                }
            }
        }
        return query.join("&");
    }

    function mark(node, regex) {
        if (!node || !regex) {
            return;
        }

        // text nodes
        if (node.nodeType === 3) {
            var nodeValue = node.nodeValue;
            var match = regex.exec(nodeValue);

            if (nodeValue && match) {
                var element = document.createElement("mark");
                element.className = NS + "-search__item-mark";
                element.appendChild(document.createTextNode(match[0]));

                var after = node.splitText(match.index);
                after.nodeValue = after.nodeValue.substring(match[0].length);
                node.parentNode.insertBefore(element, after);
            }
        } else if (node.hasChildNodes()) {
            for (var i = 0; i < node.childNodes.length; i++) {
                // recurse
                mark(node.childNodes[i], regex);
            }
        }
    }

    function Search(config) {
        if (config.element) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");
        }

        this._cacheElements(config.element);
        this._setupProperties(config.options);

        this._action = this._elements.form.getAttribute("action");
        this._resultsOffset = 0;
        this._hasMoreResults = true;

        this._elements.input.addEventListener("input", this._onInput.bind(this));
        this._elements.input.addEventListener("focus", this._onInput.bind(this));
        this._elements.input.addEventListener("keydown", this._onKeydown.bind(this));
        this._elements.clear.addEventListener("click", this._onClearClick.bind(this));
        document.addEventListener("click", this._onDocumentClick.bind(this));
        this._elements.results.addEventListener("scroll", this._onScroll.bind(this));

        this._makeAccessible();
    }

    Search.prototype._displayResults = function() {
        if (this._elements.input.value.length === 0) {
            toggleShow(this._elements.clear, false);
            this._cancelResults();
        } else if (this._elements.input.value.length < this._properties.minLength) {
            toggleShow(this._elements.clear, true);
        } else {
            this._updateResults();
            toggleShow(this._elements.clear, true);
        }
    };

    Search.prototype._onScroll = function(event) {
        // fetch new results when the results to be scrolled down are less than the visible results
        if (this._elements.results.scrollTop + 2 * this._elements.results.clientHeight >= this._elements.results.scrollHeight) {
            this._resultsOffset += this._properties.resultsSize;
            this._displayResults();
        }
    };

    Search.prototype._onInput = function(event) {
        var self = this;
        self._cancelResults();
        // start searching when the search term reaches the minimum length
        this._timeout = setTimeout(function() {
            self._displayResults();
        }, DELAY);
    };

    Search.prototype._onKeydown = function(event) {
        var self = this;

        switch (event.keyCode) {
            case keyCodes.TAB:
                if (self._resultsOpen()) {
                    toggleShow(self._elements.results, false);
                    self._elements.input.setAttribute("aria-expanded", "false");
                }
                break;
            case keyCodes.ENTER:
                event.preventDefault();
                if (self._resultsOpen()) {
                    var focused = self._elements.results.querySelector(selectors.item.focused);
                    if (focused) {
                        focused.click();
                    }
                }
                break;
            case keyCodes.ESCAPE:
                self._cancelResults();
                break;
            case keyCodes.ARROW_UP:
                if (self._resultsOpen()) {
                    event.preventDefault();
                    self._stepResultFocus(true);
                }
                break;
            case keyCodes.ARROW_DOWN:
                if (self._resultsOpen()) {
                    event.preventDefault();
                    self._stepResultFocus();
                } else {
                    // test the input and if necessary fetch and display the results
                    self._onInput();
                }
                break;
            default:
                return;
        }
    };

    Search.prototype._onClearClick = function(event) {
        event.preventDefault();
        this._elements.input.value = "";
        toggleShow(this._elements.clear, false);
        toggleShow(this._elements.results, false);
        this._elements.input.setAttribute("aria-expanded", "false");
    };

    Search.prototype._onDocumentClick = function(event) {
        var inputContainsTarget =  this._elements.input.contains(event.target);
        var resultsContainTarget = this._elements.results.contains(event.target);

        if (!(inputContainsTarget || resultsContainTarget)) {
            toggleShow(this._elements.results, false);
            this._elements.input.setAttribute("aria-expanded", "false");
        }
    };

    Search.prototype._resultsOpen = function() {
        return this._elements.results.style.display !== "none";
    };

    Search.prototype._makeAccessible = function() {
        var id = NS + "-search-results-" + idCount;
        this._elements.input.setAttribute("aria-owns", id);
        this._elements.results.id = id;
        idCount++;
    };

    Search.prototype._generateItems = function(data, results) {
        var self = this;

        data.forEach(function(item) {
            var el = document.createElement("span");
            el.innerHTML = self._elements.itemTemplate.innerHTML;
            el.querySelectorAll(selectors.item.title)[0].appendChild(document.createTextNode(item.title));
            el.querySelectorAll(selectors.item.self)[0].setAttribute("href", item.url);
            results.innerHTML += el.innerHTML;
        });
    };

    Search.prototype._markResults = function() {
        var nodeList = this._elements.results.querySelectorAll(selectors.item.self);
        var escapedTerm = this._elements.input.value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
        var regex = new RegExp("(" + escapedTerm + ")", "gi");

        for (var i = this._resultsOffset - 1; i < nodeList.length; ++i) {
            var result = nodeList[i];
            mark(result, regex);
        }
    };

    Search.prototype._stepResultFocus = function(reverse) {
        var results = this._elements.results.querySelectorAll(selectors.item.self);
        var focused = this._elements.results.querySelector(selectors.item.focused);
        var newFocused;
        var index = Array.prototype.indexOf.call(results, focused);
        var focusedCssClass = NS + "-search__item--is-focused";

        if (results.length > 0) {

            if (!reverse) {
                // highlight the next result
                if (index < 0) {
                    results[0].classList.add(focusedCssClass);
                    results[0].setAttribute("aria-selected", "true");
                } else if (index + 1 < results.length) {
                    results[index].classList.remove(focusedCssClass);
                    results[index].setAttribute("aria-selected", "false");
                    results[index + 1].classList.add(focusedCssClass);
                    results[index + 1].setAttribute("aria-selected", "true");
                }

                // if the last visible result is partially hidden, scroll up until it's completely visible
                newFocused = this._elements.results.querySelector(selectors.item.focused);
                if (newFocused) {
                    var bottomHiddenHeight = newFocused.offsetTop + newFocused.offsetHeight - this._elements.results.scrollTop - this._elements.results.clientHeight;
                    if (bottomHiddenHeight > 0) {
                        this._elements.results.scrollTop += bottomHiddenHeight;
                    } else {
                        this._onScroll();
                    }
                }

            } else {
                // highlight the previous result
                if (index >= 1) {
                    results[index].classList.remove(focusedCssClass);
                    results[index].setAttribute("aria-selected", "false");
                    results[index - 1].classList.add(focusedCssClass);
                    results[index - 1].setAttribute("aria-selected", "true");
                }

                // if the first visible result is partially hidden, scroll down until it's completely visible
                newFocused = this._elements.results.querySelector(selectors.item.focused);
                if (newFocused) {
                    var topHiddenHeight = this._elements.results.scrollTop - newFocused.offsetTop;
                    if (topHiddenHeight > 0) {
                        this._elements.results.scrollTop -= topHiddenHeight;
                    }
                }
            }
        }
    };

    Search.prototype._updateResults = function() {
        var self = this;
        if (self._hasMoreResults) {
            var request = new XMLHttpRequest();
            var url = self._action + "?" + serialize(self._elements.form) + "&" + PARAM_RESULTS_OFFSET + "=" + self._resultsOffset;

            request.open("GET", url, true);
            request.onload = function() {
                // when the results are loaded: hide the loading indicator and display the search icon after a minimum period
                setTimeout(function() {
                    toggleShow(self._elements.loadingIndicator, false);
                    toggleShow(self._elements.icon, true);
                }, LOADING_DISPLAY_DELAY);
                if (request.status >= 200 && request.status < 400) {
                    // success status
                    var data = JSON.parse(request.responseText);
                    if (data.length > 0) {
                        self._generateItems(data, self._elements.results);
                        self._markResults();
                        toggleShow(self._elements.results, true);
                        self._elements.input.setAttribute("aria-expanded", "true");
                    } else {
                        self._hasMoreResults = false;
                    }
                    // the total number of results is not a multiple of the fetched results:
                    // -> we reached the end of the query
                    if (self._elements.results.querySelectorAll(selectors.item.self).length % self._properties.resultsSize > 0) {
                        self._hasMoreResults = false;
                    }
                } else {
                    // error status
                }
            };
            // when the results are loading: display the loading indicator and hide the search icon
            toggleShow(self._elements.loadingIndicator, true);
            toggleShow(self._elements.icon, false);
            request.send();
        }
    };

    Search.prototype._cancelResults = function() {
        clearTimeout(this._timeout);
        this._elements.results.scrollTop = 0;
        this._resultsOffset = 0;
        this._hasMoreResults = true;
        this._elements.results.innerHTML = "";
        this._elements.input.setAttribute("aria-expanded", "false");
    };

    Search.prototype._cacheElements = function(wrapper) {
        this._elements = {};
        this._elements.self = wrapper;
        var hooks = this._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

        for (var i = 0; i < hooks.length; i++) {
            var hook = hooks[i];
            var capitalized = IS;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var key = hook.dataset[NS + "Hook" + capitalized];
            this._elements[key] = hook;
        }
    };

    Search.prototype._setupProperties = function(options) {
        this._properties = {};

        for (var key in properties) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) {
                var property = properties[key];
                if (options && options[key] != null) {
                    if (property && typeof property.transform === "function") {
                        this._properties[key] = property.transform(options[key]);
                    } else {
                        this._properties[key] = options[key];
                    }
                } else {
                    this._properties[key] = properties[key]["default"];
                }
            }
        }
    };

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Search({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Search({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

})();

/*******************************************************************************
 * Copyright 2016 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "formText";
    var IS_DASH = "form-text";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var properties = {
        /**
         * A validation message to display if there is a type mismatch between the user input and expected input.
         *
         * @type {String}
         */
        constraintMessage: "",
        /**
         * A validation message to display if no input is supplied, but input is expected for the field.
         *
         * @type {String}
         */
        requiredMessage: ""
    };

    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    function FormText(config) {
        if (config.element) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");
        }

        this._cacheElements(config.element);
        this._setupProperties(config.options);

        this._elements.input.addEventListener("invalid", this._onInvalid.bind(this));
        this._elements.input.addEventListener("input", this._onInput.bind(this));
    }

    FormText.prototype._onInvalid = function(event) {
        event.target.setCustomValidity("");
        if (event.target.validity.typeMismatch) {
            if (this._properties.constraintMessage) {
                event.target.setCustomValidity(this._properties.constraintMessage);
            }
        } else if (event.target.validity.valueMissing) {
            if (this._properties.requiredMessage) {
                event.target.setCustomValidity(this._properties.requiredMessage);
            }
        }
    };

    FormText.prototype._onInput = function(event) {
        event.target.setCustomValidity("");
    };

    FormText.prototype._cacheElements = function(wrapper) {
        this._elements = {};
        this._elements.self = wrapper;
        var hooks = this._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS_DASH + "]");
        for (var i = 0; i < hooks.length; i++) {
            var hook = hooks[i];
            var capitalized = IS;
            capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
            var key = hook.dataset[NS + "Hook" + capitalized];
            this._elements[key] = hook;
        }
    };

    FormText.prototype._setupProperties = function(options) {
        this._properties = {};

        for (var key in properties) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) {
                var property = properties[key];
                if (options && options[key] != null) {
                    if (property && typeof property.transform === "function") {
                        this._properties[key] = property.transform(options[key]);
                    } else {
                        this._properties[key] = options[key];
                    }
                } else {
                    this._properties[key] = properties[key]["default"];
                }
            }
        }
    };

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new FormText({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new FormText({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

})();

/*******************************************************************************
 * Copyright 2020 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "pdfviewer";
    var SDK_URL = "https://documentservices.adobe.com/view-sdk/viewer.js";
    var SDK_READY_EVENT = "adobe_dc_view_sdk.ready";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        sdkScript: 'script[src="' + SDK_URL + '"]'
    };

    function initSDK() {
        var sdkIncluded = document.querySelectorAll(selectors.sdkScript).length > 0;
        if (!window.adobe_dc_view_sdk && !sdkIncluded) {
            var dcv = document.createElement("script");
            dcv.type = "text/javascript";
            dcv.src = SDK_URL;
            document.body.appendChild(dcv);
        }
    }

    function previewPdf(component) {
        // prevents multiple initialization
        component.removeAttribute("data-" + NS + "-is");

        // add the view sdk to the page
        initSDK();

        // manage the preview
        if (component.dataset && component.id) {
            if (window.AdobeDC && window.AdobeDC.View) {
                dcView(component);
            } else {
                document.addEventListener(SDK_READY_EVENT, function() {
                    dcView(component);
                });
            }
        }
    }

    function dcView(component) {
        var adobeDCView = new window.AdobeDC.View({
            clientId: component.dataset.cmpClientId,
            divId: component.id + "-content",
            reportSuiteId: component.dataset.cmpReportSuiteId
        });
        adobeDCView.previewFile({
            content: { location: { url: component.dataset.cmpDocumentPath } },
            metaData: { fileName: component.dataset.cmpDocumentFileName }
        }, JSON.parse(component.dataset.cmpViewerConfigJson));
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Accordion components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            previewPdf(elements[i]);
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                previewPdf(element);
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });

    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }
}());

/*******************************************************************************
 * Copyright 2020 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

// https://tc39.github.io/ecma262/#sec-array.prototype.find
if (!Array.prototype.find) {
    Object.defineProperty(Array.prototype, "find", {
        value: function(predicate) {
            "use strict";
            // 1. Let O be ? ToObject(this value).
            if (this == null) {
                throw TypeError('"this" is null or not defined');
            }

            var o = Object(this);

            // 2. Let len be ? ToLength(? Get(O, "length")).
            var len = o.length >>> 0;

            // 3. If IsCallable(predicate) is false, throw a TypeError exception.
            if (typeof predicate !== "function") {
                throw TypeError("predicate must be a function");
            }

            // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
            var thisArg = arguments[1];

            // 5. Let k be 0.
            var k = 0;

            // 6. Repeat, while k < len
            while (k < len) {
                // a. Let Pk be ! ToString(k).
                // b. Let kValue be ? Get(O, Pk).
                // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
                // d. If testResult is true, return kValue.
                var kValue = o[k];
                if (predicate.call(thisArg, kValue, k, o)) {
                    return kValue;
                }
                // e. Increase k by 1.
                k++;
            }

            // 7. Return undefined.
            return undefined;
        },
        configurable: true,
        writable: true
    });
}

"use strict";function _slicedToArray(t,e){return _arrayWithHoles(t)||_iterableToArrayLimit(t,e)||_unsupportedIterableToArray(t,e)||_nonIterableRest()}function _nonIterableRest(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}function _iterableToArrayLimit(t,e){if("undefined"!=typeof Symbol&&Symbol.iterator in Object(t)){var n=[],r=!0,o=!1,a=void 0;try{for(var i,u=t[Symbol.iterator]();!(r=(i=u.next()).done)&&(n.push(i.value),!e||n.length!==e);r=!0);}catch(t){o=!0,a=t}finally{try{r||null==u.return||u.return()}finally{if(o)throw a}}return n}}function _arrayWithHoles(t){if(Array.isArray(t))return t}function _createForOfIteratorHelper(t){if("undefined"==typeof Symbol||null==t[Symbol.iterator]){if(Array.isArray(t)||(t=_unsupportedIterableToArray(t))){var e=0,n=function(){};return{s:n,n:function(){return e>=t.length?{done:!0}:{done:!1,value:t[e++]}},e:function(t){throw t},f:n}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}var r,o,a=!0,i=!1;return{s:function(){r=t[Symbol.iterator]()},n:function(){var t=r.next();return a=t.done,t},e:function(t){i=!0,o=t},f:function(){try{a||null==r.return||r.return()}finally{if(i)throw o}}}}function _unsupportedIterableToArray(t,e){if(t){if("string"==typeof t)return _arrayLikeToArray(t,e);var n=Object.prototype.toString.call(t).slice(8,-1);return"Object"===n&&t.constructor&&(n=t.constructor.name),"Map"===n||"Set"===n?Array.from(n):"Arguments"===n||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?_arrayLikeToArray(t,e):void 0}}function _arrayLikeToArray(t,e){(null==e||e>t.length)&&(e=t.length);for(var n=0,r=new Array(e);n<e;n++)r[n]=t[n];return r}function _typeof(t){return(_typeof="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(t){return typeof t}:function(t){return t&&"function"==typeof Symbol&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t})(t)}!function a(i,u,c){function f(e,t){if(!u[e]){if(!i[e]){var n="function"==typeof require&&require;if(!t&&n)return n(e,!0);if(s)return s(e,!0);var r=new Error("Cannot find module '"+e+"'");throw r.code="MODULE_NOT_FOUND",r}var o=u[e]={exports:{}};i[e][0].call(o.exports,function(t){return f(i[e][1][t]||t)},o,o.exports,a,i,u,c)}return u[e].exports}for(var s="function"==typeof require&&require,t=0;t<c.length;t++)f(c[t]);return f}({1:[function(t,wn,En){(function(On){(function(){function n(t,e){for(var n=-1,r=null==t?0:t.length,o=0,a=[];++n<r;){var i=t[n];e(i,n,t)&&(a[o++]=i)}return a}function a(t,e){for(var n=-1,r=null==t?0:t.length,o=Array(r);++n<r;)o[n]=e(t[n],n,t);return o}function f(t,e){for(var n=-1,r=e.length,o=t.length;++n<r;)t[o+n]=e[n];return t}function b(t,e){for(var n=-1,r=null==t?0:t.length;++n<r;)if(e(t[n],n,t))return!0;return!1}function o(t,e,n){var r=t.length;for(n+=-1;++n<r;)if(e(t[n],n,t))return n;return-1}function i(t){return t!=t}function t(e){return function(t){return e(t)}}function h(t){var n=-1,r=Array(t.size);return t.forEach(function(t,e){r[++n]=[e,t]}),r}function e(e){var n=Object;return function(t){return e(n(t))}}function v(t){var e=-1,n=Array(t.size);return t.forEach(function(t){n[++e]=t}),n}function r(){}function u(t){var e=-1,n=null==t?0:t.length;for(this.clear();++e<n;){var r=t[e];this.set(r[0],r[1])}}function c(t){var e=-1,n=null==t?0:t.length;for(this.clear();++e<n;){var r=t[e];this.set(r[0],r[1])}}function s(t){var e=-1,n=null==t?0:t.length;for(this.clear();++e<n;){var r=t[e];this.set(r[0],r[1])}}function d(t){var e=-1,n=null==t?0:t.length;for(this.__data__=new s;++e<n;)this.add(t[e])}function g(t){this.size=(this.__data__=new c(t)).size}function l(t,e){var n=hn(t),r=!n&&bn(t),o=!n&&!r&&vn(t),a=!n&&!r&&!o&&_n(t);if(n=n||r||o||a){r=t.length;for(var i=String,u=-1,c=Array(r);++u<r;)c[u]=i(u);r=c}else r=[];var f;i=r.length;for(f in t)!e&&!be.call(t,f)||n&&("length"==f||o&&("offset"==f||"parent"==f)||a&&("buffer"==f||"byteLength"==f||"byteOffset"==f)||Q(f,i))||r.push(f);return r}function _(t,e,n){(n===Mt||ft(t[e],n))&&(n!==Mt||e in t)||j(t,e,n)}function y(t,e,n){var r=t[e];be.call(t,e)&&ft(r,n)&&(n!==Mt||e in t)||j(t,e,n)}function p(t,e){for(var n=t.length;n--;)if(ft(t[n][0],e))return n;return-1}function j(t,e,n){"__proto__"==e&&xe?xe(t,e,{configurable:!0,enumerable:!0,value:n,writable:!0}):t[e]=n}function m(n,r,o,t,e,a){var i,u=1&r,c=2&r,f=4&r;if(o&&(i=e?o(n,t,e,a):o(n)),i!==Mt)return i;if(!bt(n))return n;if(t=hn(n)){if(i=function(t){var e=t.length,n=new t.constructor(e);return e&&"string"==typeof t[0]&&be.call(t,"index")&&(n.index=t.index,n.input=t.input),n}(n),!u)return U(n,i)}else{var s=nn(n),l="[object Function]"==s||"[object GeneratorFunction]"==s;if(vn(n))return M(n,u);if("[object Object]"==s||"[object Arguments]"==s||l&&!e){if(i=c||l?{}:Y(n),!u)return c?function(t,e){return P(t,en(t),e)}(n,function(t,e){return t&&P(e,St(e),t)}(i,n)):function(t,e){return P(t,tn(t),e)}(n,function(t,e){return t&&P(e,Lt(e),t)}(i,n))}else{if(!Kt[s])return e?n:{};i=function(t,e,n){var r=t.constructor;switch(e){case"[object ArrayBuffer]":return z(t);case"[object Boolean]":case"[object Date]":return new r(+t);case"[object DataView]":return e=n?z(t.buffer):t.buffer,new t.constructor(e,t.byteOffset,t.byteLength);case"[object Float32Array]":case"[object Float64Array]":case"[object Int8Array]":case"[object Int16Array]":case"[object Int32Array]":case"[object Uint8Array]":case"[object Uint8ClampedArray]":case"[object Uint16Array]":case"[object Uint32Array]":return C(t,n);case"[object Map]":return new r;case"[object Number]":case"[object String]":return new r(t);case"[object RegExp]":return(e=new t.constructor(t.source,Ht.exec(t))).lastIndex=t.lastIndex,e;case"[object Set]":return new r;case"[object Symbol]":return qe?Object(qe.call(t)):{}}}(n,s,u)}}if(e=(a=a||new g).get(n))return e;if(a.set(n,i),gn(n))return n.forEach(function(t){i.add(m(t,r,o,t,n,a))}),i;if(dn(n))return n.forEach(function(t,e){i.set(e,m(t,r,o,e,n,a))}),i;c=f?c?B:H:c?St:Lt;var p=t?Mt:c(n);return function(t,e){for(var n=-1,r=null==t?0:t.length;++n<r&&!1!==e(t[n],n,t););}(p||n,function(t,e){p&&(t=n[e=t]),y(i,e,m(t,r,o,e,n,a))}),i}function A(t,e){for(var n=0,r=(e=F(e,t)).length;null!=t&&n<r;)t=t[nt(e[n++])];return n&&n==r?t:Mt}function O(t,e,n){return e=e(t),hn(t)?e:f(e,n(t))}function w(t){if(null==t)t=t===Mt?"[object Undefined]":"[object Null]";else if(Te&&Te in Object(t)){var e=be.call(t,Te),n=t[Te];try{t[Te]=Mt;var r=!0}catch(t){}var o=ve.call(t);r&&(e?t[Te]=n:delete t[Te]),t=o}else t=ve.call(t);return t}function E(t,e){return null!=t&&be.call(t,e)}function L(t,e){return null!=t&&e in Object(t)}function S(t){return ht(t)&&"[object Arguments]"==w(t)}function T(t,e,n,r,o){if(t===e)e=!0;else if(null==t||null==e||!ht(t)&&!ht(e))e=t!=t&&e!=e;else t:{var a,i,u=hn(t),c=hn(e),f="[object Object]"==(a="[object Arguments]"==(a=u?"[object Array]":nn(t))?"[object Object]":a);c="[object Object]"==(i="[object Arguments]"==(i=c?"[object Array]":nn(e))?"[object Object]":i);if((i=a==i)&&vn(t)){if(!vn(e)){e=!1;break t}f=!(u=!0)}if(i&&!f)o=o||new g,e=u||_n(t)?V(t,e,n,r,T,o):function(t,e,n,r,o,a,i){switch(n){case"[object DataView]":if(t.byteLength!=e.byteLength||t.byteOffset!=e.byteOffset)break;t=t.buffer,e=e.buffer;case"[object ArrayBuffer]":if(t.byteLength!=e.byteLength||!a(new me(t),new me(e)))break;return!0;case"[object Boolean]":case"[object Date]":case"[object Number]":return ft(+t,+e);case"[object Error]":return t.name==e.name&&t.message==e.message;case"[object RegExp]":case"[object String]":return t==e+"";case"[object Map]":var u=h;case"[object Set]":if(u=u||v,t.size!=e.size&&!(1&r))break;return(n=i.get(t))?n==e:(r|=2,i.set(t,e),e=V(u(t),u(e),r,o,a,i),i.delete(t),e);case"[object Symbol]":if(qe)return qe.call(t)==qe.call(e)}return!1}(t,e,a,n,r,T,o);else{if(!(1&n)&&(u=f&&be.call(t,"__wrapped__"),a=c&&be.call(e,"__wrapped__"),u||a)){e=T(t=u?t.value():t,e=a?e.value():e,n,r,o=o||new g);break t}if(i)e:if(o=o||new g,u=1&n,a=H(t),c=a.length,i=H(e).length,c==i||u){for(f=c;f--;){var s=a[f];if(!(u?s in e:be.call(e,s))){e=!1;break e}}if((i=o.get(t))&&o.get(e))e=i==e;else{i=!0,o.set(t,e),o.set(e,t);for(var l=u;++f<c;){var p=t[s=a[f]],y=e[s];if(r)var b=u?r(y,p,s,e,t,o):r(p,y,s,t,e,o);if(b===Mt?p!==y&&!T(p,y,n,r,o):!b){i=!1;break}l=l||"constructor"==s}i&&!l&&((n=t.constructor)!=(r=e.constructor)&&"constructor"in t&&"constructor"in e&&!("function"==typeof n&&n instanceof n&&"function"==typeof r&&r instanceof r)&&(i=!1)),o.delete(t),o.delete(e),e=i}}else e=!1;else e=!1}}return e}function x(t){return"function"==typeof t?t:null==t?It:"object"==_typeof(t)?hn(t)?function(n,r){return X(n)&&r==r&&!bt(r)?tt(nt(n),r):function(t){var e=wt(t,n);return e===Mt&&e===r?Et(t,n):T(r,e,3)}}(t[0],t[1]):function(e){var n=function(t){for(var e=Lt(t),n=e.length;n--;){var r=e[n],o=t[r];e[n]=[r,o,o==o&&!bt(o)]}return e}(e);return 1==n.length&&n[0][2]?tt(n[0][0],n[0][1]):function(t){return t===e||function(t,e){var n=e.length,r=n;if(null==t)return!r;for(t=Object(t);n--;){if((o=e[n])[2]?o[1]!==t[o[0]]:!(o[0]in t))return!1}for(;++n<r;){var o,a=(o=e[n])[0],i=t[a],u=o[1];if(o[2]){if(i===Mt&&!(a in t))return!1}else if(o=new g,void 0!==Mt||!T(u,i,3,void 0,o))return!1}return!0}(t,n)}}(t):Nt(t)}function I(t){if(!Z(t))return Ne(t);var e,n=[];for(e in Object(t))be.call(t,e)&&"constructor"!=e&&n.push(e);return n}function k(s,l,p,y,b){s!==l&&Xe(l,function(t,e){if(bt(t)){var n=b=b||new g,r="__proto__"==e?Mt:s[e],o="__proto__"==e?Mt:l[e];if(f=n.get(o))_(s,e,f);else{var a=(f=y?y(r,o,e+"",s,l,n):Mt)===Mt;if(a){var i=hn(o),u=!i&&vn(o),c=!i&&!u&&_n(o),f=o;i||u||c?f=hn(r)?r:lt(r)?U(r):u?M(o,!(a=!1)):c?C(o,!(a=!1)):[]:vt(o)||bn(o)?bn(f=r)?f=At(r):(!bt(r)||p&&pt(r))&&(f=Y(o)):a=!1}a&&(n.set(o,f),k(f,o,p,y,n),n.delete(o)),_(s,e,f)}}else(n=y?y("__proto__"==e?Mt:s[e],t,e+"",s,l,b):Mt)===Mt&&(n=t),_(s,e,n)},St)}function N(t){if("string"==typeof t)return t;if(hn(t))return a(t,N)+"";if(gt(t))return Je?Je.call(t):"";var e=t+"";return"0"==e&&1/t==-zt?"-0":e}function D(t,e){var n;if((e=F(e,t)).length<2)n=t;else{var r=0,o=-1,a=-1,i=(n=e).length;for(r<0&&(r=i<-r?0:i+r),(o=i<o?i:o)<0&&(o+=i),i=o<r?0:o-r>>>0,r>>>=0,o=Array(i);++a<i;)o[a]=n[a+r];n=A(t,o)}null==(t=n)||delete t[nt(it(e))]}function F(t,e){return hn(t)?t:X(t,e)?[t]:ln(Ot(t))}function M(t,e){if(e)return t.slice();var n=t.length;n=Ae?Ae(n):new t.constructor(n);return t.copy(n),n}function z(t){var e=new t.constructor(t.byteLength);return new me(e).set(new me(t)),e}function C(t,e){return new t.constructor(e?z(t.buffer):t.buffer,t.byteOffset,t.length)}function U(t,e){var n=-1,r=t.length;for(e=e||Array(r);++n<r;)e[n]=t[n];return e}function P(t,e,n){var r=!n;n=n||{};for(var o=-1,a=e.length;++o<a;){var i=e[o],u=Mt;u===Mt&&(u=t[i]),r?j(n,i,u):y(n,i,u)}return n}function R(f){return function(t){return sn(et(t,void 0,It),t+"")}(function(t,e){var n,r=-1,o=e.length,a=1<o?e[o-1]:Mt,i=2<o?e[2]:Mt;a=3<f.length&&"function"==typeof a?(o--,a):Mt;if(n=i){n=e[0];var u=e[1];if(bt(i)){var c=_typeof(u);n=!!("number"==c?st(i)&&Q(u,i.length):"string"==c&&u in i)&&ft(i[u],n)}else n=!1}for(n&&(a=o<3?Mt:a,o=1),t=Object(t);++r<o;)(i=e[r])&&f(t,i,r,a);return t})}function $(t){return vt(t)?Mt:t}function V(t,e,n,r,o,a){var i=1&n,u=t.length;if(u!=(c=e.length)&&!(i&&u<c))return!1;if((c=a.get(t))&&a.get(e))return c==e;var c=-1,f=!0,s=2&n?new d:Mt;for(a.set(t,e),a.set(e,t);++c<u;){var l=t[c],p=e[c];if(r)var y=i?r(p,l,c,e,t,a):r(l,p,c,t,e,a);if(y!==Mt){if(y)continue;f=!1;break}if(s){if(!b(e,function(t,e){if(!s.has(e)&&(l===t||o(l,t,n,r,a)))return s.push(e)})){f=!1;break}}else if(l!==p&&!o(l,p,n,r,a)){f=!1;break}}return a.delete(t),a.delete(e),f}function H(t){return O(t,Lt,tn)}function B(t){return O(t,St,en)}function W(t,e){var n=(n=r.iteratee||kt)===kt?x:n;return arguments.length?n(t,e):n}function G(t,e){var n=t.__data__,r=_typeof(e);return("string"==r||"number"==r||"symbol"==r||"boolean"==r?"__proto__"!==e:null===e)?n["string"==typeof e?"string":"hash"]:n.map}function q(t,e){var n=null==t?Mt:t[e];return!bt(n)||he&&he in n||!(pt(n)?ge:Gt).test(rt(n))?Mt:n}function J(t,e,n){for(var r=-1,o=(e=F(e,t)).length,a=!1;++r<o;){var i=nt(e[r]);if(!(a=null!=t&&n(t,i)))break;t=t[i]}return a||++r!=o?a:!!(o=null==t?0:t.length)&&yt(o)&&Q(i,o)&&(hn(t)||bn(t))}function Y(t){return"function"!=typeof t.constructor||Z(t)?{}:Ye(Oe(t))}function K(t){return hn(t)||bn(t)||!!(Se&&t&&t[Se])}function Q(t,e){var n=_typeof(t);return!!(e=null==e?9007199254740991:e)&&("number"==n||"symbol"!=n&&Jt.test(t))&&-1<t&&0==t%1&&t<e}function X(t,e){if(hn(t))return!1;var n=_typeof(t);return!("number"!=n&&"symbol"!=n&&"boolean"!=n&&null!=t&&!gt(t))||Pt.test(t)||!Ut.test(t)||null!=e&&t in Object(e)}function Z(t){var e=t&&t.constructor;return t===("function"==typeof e&&e.prototype||le)}function tt(e,n){return function(t){return null!=t&&t[e]===n&&(n!==Mt||e in Object(t))}}function et(o,a,i){return a=De(a===Mt?o.length-1:a,0),function(){for(var t=arguments,e=-1,n=De(t.length-a,0),r=Array(n);++e<n;)r[e]=t[a+e];for(e=-1,n=Array(a+1);++e<a;)n[e]=t[e];return n[a]=i(r),function(t,e,n){switch(n.length){case 0:return t.call(e);case 1:return t.call(e,n[0]);case 2:return t.call(e,n[0],n[1]);case 3:return t.call(e,n[0],n[1],n[2])}return t.apply(e,n)}(o,this,n)}}function nt(t){if("string"==typeof t||gt(t))return t;var e=t+"";return"0"==e&&1/t==-zt?"-0":e}function rt(t){if(null==t)return"";try{return ye.call(t)}catch(t){}return t+""}function ot(t,e,n){var r=null==t?0:t.length;return r?((n=null==n?0:jt(n))<0&&(n=De(r+n,0)),o(t,W(e,3),n)):-1}function at(t){return null!=t&&t.length?function t(e,n,r,o,a){var i=-1,u=e.length;for(r=r||K,a=a||[];++i<u;){var c=e[i];0<n&&r(c)?1<n?t(c,n-1,r,o,a):f(a,c):o||(a[a.length]=c)}return a}(t,1):[]}function it(t){var e=null==t?0:t.length;return e?t[e-1]:Mt}function ut(r,o){function a(){var t=arguments,e=o?o.apply(this,t):t[0],n=a.cache;return n.has(e)?n.get(e):(t=r.apply(this,t),a.cache=n.set(e,t)||n,t)}if("function"!=typeof r||null!=o&&"function"!=typeof o)throw new TypeError("Expected a function");return a.cache=new(ut.Cache||s),a}function ct(e){if("function"!=typeof e)throw new TypeError("Expected a function");return function(){var t=arguments;switch(t.length){case 0:return!e.call(this);case 1:return!e.call(this,t[0]);case 2:return!e.call(this,t[0],t[1]);case 3:return!e.call(this,t[0],t[1],t[2])}return!e.apply(this,t)}}function ft(t,e){return t===e||t!=t&&e!=e}function st(t){return null!=t&&yt(t.length)&&!pt(t)}function lt(t){return ht(t)&&st(t)}function pt(t){return!!bt(t)&&("[object Function]"==(t=w(t))||"[object GeneratorFunction]"==t||"[object AsyncFunction]"==t||"[object Proxy]"==t)}function yt(t){return"number"==typeof t&&-1<t&&0==t%1&&t<=9007199254740991}function bt(t){var e=_typeof(t);return null!=t&&("object"==e||"function"==e)}function ht(t){return null!=t&&"object"==_typeof(t)}function vt(t){return!(!ht(t)||"[object Object]"!=w(t))&&(null===(t=Oe(t))||"function"==typeof(t=be.call(t,"constructor")&&t.constructor)&&t instanceof t&&ye.call(t)==de)}function dt(t){return"string"==typeof t||!hn(t)&&ht(t)&&"[object String]"==w(t)}function gt(t){return"symbol"==_typeof(t)||ht(t)&&"[object Symbol]"==w(t)}function _t(t){return t?(t=mt(t))===zt||t===-zt?17976931348623157e292*(t<0?-1:1):t==t?t:0:0===t?t:0}function jt(t){var e=(t=_t(t))%1;return t==t?e?t-e:t:0}function mt(t){if("number"==typeof t)return t;if(gt(t))return Ct;if(bt(t)&&(t=bt(t="function"==typeof t.valueOf?t.valueOf():t)?t+"":t),"string"!=typeof t)return 0===t?t:+t;t=t.replace($t,"");var e=Wt.test(t);return e||qt.test(t)?Xt(t.slice(2),e?2:8):Bt.test(t)?Ct:+t}function At(t){return P(t,St(t))}function Ot(t){return null==t?"":N(t)}function wt(t,e,n){return(t=null==t?Mt:A(t,e))===Mt?n:t}function Et(t,e){return null!=t&&J(t,e,L)}function Lt(t){return st(t)?l(t):I(t)}function St(t){if(st(t))t=l(t,!0);else if(bt(t)){var e,n=Z(t),r=[];for(e in t)("constructor"!=e||!n&&be.call(t,e))&&r.push(e);t=r}else{if(e=[],null!=t)for(n in Object(t))e.push(n);t=e}return t}function Tt(t){return null==t?[]:function(e,t){return a(t,function(t){return e[t]})}(t,Lt(t))}function xt(t){return function(){return t}}function It(t){return t}function kt(t){return x("function"==typeof t?t:m(t,1))}function Nt(t){return X(t)?function(e){return function(t){return null==t?Mt:t[e]}}(nt(t)):function(e){return function(t){return A(t,e)}}(t)}function Dt(){return[]}function Ft(){return!1}var Mt,zt=1/0,Ct=NaN,Ut=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,Pt=/^\w*$/,Rt=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,$t=/^\s+|\s+$/g,Vt=/\\(\\)?/g,Ht=/\w*$/,Bt=/^[-+]0x[0-9a-f]+$/i,Wt=/^0b[01]+$/i,Gt=/^\[object .+?Constructor\]$/,qt=/^0o[0-7]+$/i,Jt=/^(?:0|[1-9]\d*)$/,Yt={};Yt["[object Float32Array]"]=Yt["[object Float64Array]"]=Yt["[object Int8Array]"]=Yt["[object Int16Array]"]=Yt["[object Int32Array]"]=Yt["[object Uint8Array]"]=Yt["[object Uint8ClampedArray]"]=Yt["[object Uint16Array]"]=Yt["[object Uint32Array]"]=!0,Yt["[object Arguments]"]=Yt["[object Array]"]=Yt["[object ArrayBuffer]"]=Yt["[object Boolean]"]=Yt["[object DataView]"]=Yt["[object Date]"]=Yt["[object Error]"]=Yt["[object Function]"]=Yt["[object Map]"]=Yt["[object Number]"]=Yt["[object Object]"]=Yt["[object RegExp]"]=Yt["[object Set]"]=Yt["[object String]"]=Yt["[object WeakMap]"]=!1;var Kt={};Kt["[object Arguments]"]=Kt["[object Array]"]=Kt["[object ArrayBuffer]"]=Kt["[object DataView]"]=Kt["[object Boolean]"]=Kt["[object Date]"]=Kt["[object Float32Array]"]=Kt["[object Float64Array]"]=Kt["[object Int8Array]"]=Kt["[object Int16Array]"]=Kt["[object Int32Array]"]=Kt["[object Map]"]=Kt["[object Number]"]=Kt["[object Object]"]=Kt["[object RegExp]"]=Kt["[object Set]"]=Kt["[object String]"]=Kt["[object Symbol]"]=Kt["[object Uint8Array]"]=Kt["[object Uint8ClampedArray]"]=Kt["[object Uint16Array]"]=Kt["[object Uint32Array]"]=!0,Kt["[object Error]"]=Kt["[object Function]"]=Kt["[object WeakMap]"]=!1;var Qt,Xt=parseInt,Zt="object"==_typeof(On)&&On&&On.Object===Object&&On,te="object"==("undefined"==typeof self?"undefined":_typeof(self))&&self&&self.Object===Object&&self,ee=Zt||te||Function("return this")(),ne="object"==_typeof(En)&&En&&!En.nodeType&&En,re=ne&&"object"==_typeof(wn)&&wn&&!wn.nodeType&&wn,oe=re&&re.exports===ne,ae=oe&&Zt.process;t:{try{Qt=ae&&ae.binding&&ae.binding("util");break t}catch(t){}Qt=void 0}var ie,ue=Qt&&Qt.isMap,ce=Qt&&Qt.isSet,fe=Qt&&Qt.isTypedArray,se=Array.prototype,le=Object.prototype,pe=ee["__core-js_shared__"],ye=Function.prototype.toString,be=le.hasOwnProperty,he=(ie=/[^.]+$/.exec(pe&&pe.keys&&pe.keys.IE_PROTO||""))?"Symbol(src)_1."+ie:"",ve=le.toString,de=ye.call(Object),ge=RegExp("^"+ye.call(be).replace(/[\\^$.*+?()[\]{}|]/g,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$"),_e=oe?ee.Buffer:Mt,je=ee.Symbol,me=ee.Uint8Array,Ae=_e?_e.a:Mt,Oe=e(Object.getPrototypeOf),we=Object.create,Ee=le.propertyIsEnumerable,Le=se.splice,Se=je?je.isConcatSpreadable:Mt,Te=je?je.toStringTag:Mt,xe=function(){try{var t=q(Object,"defineProperty");return t({},"",{}),t}catch(t){}}(),Ie=Object.getOwnPropertySymbols,ke=_e?_e.isBuffer:Mt,Ne=e(Object.keys),De=Math.max,Fe=Date.now,Me=q(ee,"DataView"),ze=q(ee,"Map"),Ce=q(ee,"Promise"),Ue=q(ee,"Set"),Pe=q(ee,"WeakMap"),Re=q(Object,"create"),$e=rt(Me),Ve=rt(ze),He=rt(Ce),Be=rt(Ue),We=rt(Pe),Ge=je?je.prototype:Mt,qe=Ge?Ge.valueOf:Mt,Je=Ge?Ge.toString:Mt,Ye=function(t){return bt(t)?we?we(t):(Ke.prototype=t,t=new Ke,Ke.prototype=Mt,t):{}};function Ke(){}u.prototype.clear=function(){this.__data__=Re?Re(null):{},this.size=0},u.prototype.delete=function(t){return t=this.has(t)&&delete this.__data__[t],this.size-=t?1:0,t},u.prototype.get=function(t){var e=this.__data__;return Re?"__lodash_hash_undefined__"===(t=e[t])?Mt:t:be.call(e,t)?e[t]:Mt},u.prototype.has=function(t){var e=this.__data__;return Re?e[t]!==Mt:be.call(e,t)},u.prototype.set=function(t,e){var n=this.__data__;return this.size+=this.has(t)?0:1,n[t]=Re&&e===Mt?"__lodash_hash_undefined__":e,this},c.prototype.clear=function(){this.__data__=[],this.size=0},c.prototype.delete=function(t){var e=this.__data__;return!((t=p(e,t))<0||(t==e.length-1?e.pop():Le.call(e,t,1),--this.size,0))},c.prototype.get=function(t){var e=this.__data__;return(t=p(e,t))<0?Mt:e[t][1]},c.prototype.has=function(t){return-1<p(this.__data__,t)},c.prototype.set=function(t,e){var n=this.__data__,r=p(n,t);return r<0?(++this.size,n.push([t,e])):n[r][1]=e,this},s.prototype.clear=function(){this.size=0,this.__data__={hash:new u,map:new(ze||c),string:new u}},s.prototype.delete=function(t){return t=G(this,t).delete(t),this.size-=t?1:0,t},s.prototype.get=function(t){return G(this,t).get(t)},s.prototype.has=function(t){return G(this,t).has(t)},s.prototype.set=function(t,e){var n=G(this,t),r=n.size;return n.set(t,e),this.size+=n.size==r?0:1,this},d.prototype.add=d.prototype.push=function(t){return this.__data__.set(t,"__lodash_hash_undefined__"),this},d.prototype.has=function(t){return this.__data__.has(t)},g.prototype.clear=function(){this.__data__=new c,this.size=0},g.prototype.delete=function(t){var e=this.__data__;return t=e.delete(t),this.size=e.size,t},g.prototype.get=function(t){return this.__data__.get(t)},g.prototype.has=function(t){return this.__data__.has(t)},g.prototype.set=function(t,e){var n=this.__data__;if(n instanceof c){var r=n.__data__;if(!ze||r.length<199)return r.push([t,e]),this.size=++n.size,this;n=this.__data__=new s(r)}return n.set(t,e),this.size=n.size,this};var Qe=function(t,e){if(null==t)return t;if(!st(t))return function(t,e){return t&&Xe(t,e,Lt)}(t,e);for(var n=t.length,r=-1,o=Object(t);++r<n&&!1!==e(o[r],r,o););return t},Xe=function(t,e,n){for(var r=-1,o=Object(t),a=(n=n(t)).length;a--;){var i=n[++r];if(!1===e(o[i],i,o))break}return t},Ze=xe?function(t,e){return xe(t,"toString",{configurable:!0,enumerable:!1,value:xt(e),writable:!0})}:It,tn=Ie?function(e){return null==e?[]:(e=Object(e),n(Ie(e),function(t){return Ee.call(e,t)}))}:Dt,en=Ie?function(t){for(var e=[];t;)f(e,tn(t)),t=Oe(t);return e}:Dt,nn=w;(Me&&"[object DataView]"!=nn(new Me(new ArrayBuffer(1)))||ze&&"[object Map]"!=nn(new ze)||Ce&&"[object Promise]"!=nn(Ce.resolve())||Ue&&"[object Set]"!=nn(new Ue)||Pe&&"[object WeakMap]"!=nn(new Pe))&&(nn=function(t){var e=w(t);if(t=(t="[object Object]"==e?t.constructor:Mt)?rt(t):"")switch(t){case $e:return"[object DataView]";case Ve:return"[object Map]";case He:return"[object Promise]";case Be:return"[object Set]";case We:return"[object WeakMap]"}return e});var rn,on,an,un,cn,fn,sn=(un=Ze,fn=cn=0,function(){var t=Fe(),e=16-(t-fn);if(fn=t,0<e){if(800<=++cn)return arguments[0]}else cn=0;return un.apply(Mt,arguments)}),ln=(an=(on=ut(on=function(t){var o=[];return 46===t.charCodeAt(0)&&o.push(""),t.replace(Rt,function(t,e,n,r){o.push(n?r.replace(Vt,"$1"):e||t)}),o},function(t){return 500===an.size&&an.clear(),t})).cache,on),pn=(rn=ot,function(t,e,n){var r=Object(t);if(!st(t)){var o=W(e,3);t=Lt(t),e=function(t){return o(r[t],t,r)}}return-1<(e=rn(t,e,n))?r[o?t[e]:e]:Mt});ut.Cache=s;var yn,bn=S(function(){return arguments}())?S:function(t){return ht(t)&&be.call(t,"callee")&&!Ee.call(t,"callee")},hn=Array.isArray,vn=ke||Ft,dn=ue?t(ue):function(t){return ht(t)&&"[object Map]"==nn(t)},gn=ce?t(ce):function(t){return ht(t)&&"[object Set]"==nn(t)},_n=fe?t(fe):function(t){return ht(t)&&yt(t.length)&&!!Yt[w(t)]},jn=R(function(t,e,n){k(t,e,n)}),mn=R(function(t,e,n,r){k(t,e,n,r)}),An=sn(et(yn=function(e,t){var n={};if(null==e)return n;var r=!1;t=a(t,function(t){return t=F(t,e),r=r||1<t.length,t}),P(e,B(e),n),r&&(n=m(n,7,$));for(var o=t.length;o--;)D(n,t[o]);return n},Mt,at),yn+"");r.constant=xt,r.flatten=at,r.iteratee=kt,r.keys=Lt,r.keysIn=St,r.memoize=ut,r.merge=jn,r.mergeWith=mn,r.negate=ct,r.omit=An,r.property=Nt,r.reject=function(t,e){return(hn(t)?n:function(t,r){var o=[];return Qe(t,function(t,e,n){r(t,e,n)&&o.push(t)}),o})(t,ct(W(e,3)))},r.toPlainObject=At,r.values=Tt,r.cloneDeep=function(t){return m(t,5)},r.cloneDeepWith=function(t,e){return m(t,5,e="function"==typeof e?e:Mt)},r.eq=ft,r.find=pn,r.findIndex=ot,r.get=wt,r.has=function(t,e){return null!=t&&J(t,e,E)},r.hasIn=Et,r.identity=It,r.includes=function(t,e,n,r){if(t=st(t)?t:Tt(t),n=n&&!r?jt(n):0,r=t.length,n<0&&(n=De(r+n,0)),dt(t))t=n<=r&&-1<t.indexOf(e,n);else{if(r=!!r){if(e==e)t:{for(n-=1,r=t.length;++n<r;)if(t[n]===e){t=n;break t}t=-1}else t=o(t,i,n);r=-1<t}t=r}return t},r.isArguments=bn,r.isArray=hn,r.isArrayLike=st,r.isArrayLikeObject=lt,r.isBuffer=vn,r.isEmpty=function(t){if(null==t)return!0;if(st(t)&&(hn(t)||"string"==typeof t||"function"==typeof t.splice||vn(t)||_n(t)||bn(t)))return!t.length;var e=nn(t);if("[object Map]"==e||"[object Set]"==e)return!t.size;if(Z(t))return!I(t).length;for(var n in t)if(be.call(t,n))return!1;return!0},r.isEqual=function(t,e){return T(t,e)},r.isFunction=pt,r.isLength=yt,r.isMap=dn,r.isNull=function(t){return null===t},r.isObject=bt,r.isObjectLike=ht,r.isPlainObject=vt,r.isSet=gn,r.isString=dt,r.isSymbol=gt,r.isTypedArray=_n,r.last=it,r.stubArray=Dt,r.stubFalse=Ft,r.toFinite=_t,r.toInteger=jt,r.toNumber=mt,r.toString=Ot,r.VERSION="4.17.5",re&&((re.exports=r)._=r,ne._=r)}).call(this)}).call(this,"undefined"!=typeof global?global:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{})},{}],2:[function(t,e,n){e.exports={itemType:{DATA:"data",FCTN:"fctn",EVENT:"event",LISTENER_ON:"listenerOn",LISTENER_OFF:"listenerOff"},dataLayerEvent:{CHANGE:"adobeDataLayer:change",EVENT:"adobeDataLayer:event"},listenerScope:{PAST:"past",FUTURE:"future",ALL:"all"}}},{}],3:[function(t,e,n){var r=t("../custom-lodash"),c=t("../version.json").version,l=r.cloneDeep,p=r.get,y=t("./item"),b=t("./listener"),h=t("./listenerManager"),v=t("./constants"),d=t("./utils/customMerge");e.exports=function(t){var f,e=t||{},n=[],r=[],o={},a={getState:function(){return o},getDataLayer:function(){return n}};function i(t){o=d(o,t.data)}function u(t){t.valid?{data:function(t){i(t),f.triggerListeners(t)},fctn:function(t){t.config.call(n,n)},event:function(t){t.data&&i(t),f.triggerListeners(t)},listenerOn:function(t){var e=b(t);switch(e.scope){case v.listenerScope.PAST:var n,r=_createForOfIteratorHelper(c(t));try{for(r.s();!(n=r.n()).done;){var o=n.value;f.triggerListener(e,o)}}catch(t){r.e(t)}finally{r.f()}break;case v.listenerScope.FUTURE:f.register(e);break;case v.listenerScope.ALL:if(f.register(e)){var a,i=_createForOfIteratorHelper(c(t));try{for(i.s();!(a=i.n()).done;){var u=a.value;f.triggerListener(e,u)}}catch(t){i.e(t)}finally{i.f()}}}},listenerOff:function(t){f.unregister(b(t))}}[t.type](t):s(t);function c(t){return 0===n.length||t.index>n.length-1?[]:n.slice(0,t.index).map(function(t){return y(t)})}}function s(t){var e="The following item cannot be handled by the data layer because it does not have a valid format: "+JSON.stringify(t.config);console.error(e)}return function(){Array.isArray(e.dataLayer)||(e.dataLayer=[]);r=e.dataLayer.splice(0,e.dataLayer.length),(n=e.dataLayer).version=c,o={},f=h(a)}(),n.push=function(t){var n=arguments,r=arguments;if(Object.keys(n).forEach(function(t){var e=y(n[t]);switch(e.valid||(s(e),delete r[t]),e.type){case v.itemType.DATA:case v.itemType.EVENT:u(e);break;case v.itemType.FCTN:delete r[t],u(e);break;case v.itemType.LISTENER_ON:case v.itemType.LISTENER_OFF:delete r[t]}}),r[0])return Array.prototype.push.apply(this,r)},n.getState=function(t){return t?p(l(o),t):l(o)},n.addEventListener=function(t,e,n){u(y({on:t,handler:e,scope:n&&n.scope,path:n&&n.path}))},n.removeEventListener=function(t,e){u(y({off:t,handler:e}))},function(){for(var t=0;t<r.length;t++)n.push(r[t])}(),a}},{"../custom-lodash":1,"../version.json":14,"./constants":2,"./item":5,"./listener":7,"./listenerManager":8,"./utils/customMerge":10}],4:[function(t,e,n){var r={Manager:t("./dataLayerManager")};window.adobeDataLayer=window.adobeDataLayer||[],window.adobeDataLayer.version?console.warn("Adobe Client Data Layer v".concat(window.adobeDataLayer.version," has already been imported/initialized on this page. You may be erroneously loading it a second time.")):r.Manager({dataLayer:window.adobeDataLayer}),e.exports=r},{"./dataLayerManager":3}],5:[function(t,e,n){var r=t("../custom-lodash"),i=r.isPlainObject,u=r.isEmpty,c=r.omit,f=r.find,s=t("./utils/dataMatchesContraints"),l=t("./itemConstraints"),p=t("./constants");e.exports=function(t,e){var n=t,r=e,o=f(Object.keys(l),function(t){return s(n,l[t])})||"function"==typeof n&&p.itemType.FCTN||i(n)&&p.itemType.DATA,a=function(){var t=c(n,Object.keys(l.event));if(!u(t))return t}();return{config:n,type:o,data:a,valid:!!o,index:r}}},{"../custom-lodash":1,"./constants":2,"./itemConstraints":6,"./utils/dataMatchesContraints":11}],6:[function(t,e,n){e.exports={event:{event:{type:"string"},eventInfo:{optional:!0}},listenerOn:{on:{type:"string"},handler:{type:"function"},scope:{type:"string",values:["past","future","all"],optional:!0},path:{type:"string",optional:!0}},listenerOff:{off:{type:"string"},handler:{type:"function",optional:!0},scope:{type:"string",values:["past","future","all"],optional:!0},path:{type:"string",optional:!0}}}},{}],7:[function(t,e,n){var r=t("./constants");e.exports=function(t){return{event:t.config.on||t.config.off,handler:t.config.handler||null,scope:t.config.scope||t.config.on&&r.listenerScope.ALL||null,path:t.config.path||null}}},{"./constants":2}],8:[function(t,e,n){var u=t("../custom-lodash").cloneDeep,c=t("./constants"),f=t("./utils/listenerMatch"),s=t("./utils/indexOfListener");e.exports=function(t){var o={},r=t,a=s.bind(null,o);function i(t,e){if(f(t,e)){var n=[u(e.config)];t.handler.apply(r.getDataLayer(),n)}}return{register:function(t){var e=t.event;return Object.prototype.hasOwnProperty.call(o,e)?-1===a(t)&&(o[t.event].push(t),!0):(o[t.event]=[t],!0)},unregister:function(t){var e=t.event;if(Object.prototype.hasOwnProperty.call(o,e))if(t.handler||t.scope||t.path){var n=a(t);-1<n&&o[e].splice(n,1)}else o[e]=[]},triggerListeners:function(r){(function(t){var e=[];switch(t.type){case c.itemType.DATA:e.push(c.dataLayerEvent.CHANGE);break;case c.itemType.EVENT:e.push(c.dataLayerEvent.EVENT),t.data&&e.push(c.dataLayerEvent.CHANGE),t.config.event!==c.dataLayerEvent.CHANGE&&e.push(t.config.event)}return e})(r).forEach(function(t){if(Object.prototype.hasOwnProperty.call(o,t)){var e,n=_createForOfIteratorHelper(o[t]);try{for(n.s();!(e=n.n()).done;){i(e.value,r)}}catch(t){n.e(t)}finally{n.f()}}})},triggerListener:function(t,e){i(t,e)}}}},{"../custom-lodash":1,"./constants":2,"./utils/indexOfListener":12,"./utils/listenerMatch":13}],9:[function(t,e,n){var r=t("../../custom-lodash"),o=r.has,a=r.get;e.exports=function(t,e){for(var n=e.substring(0,e.lastIndexOf("."));n;){if(o(t,n)){var r=a(t,n);if(null==r)return!0}n=n.substring(0,n.lastIndexOf("."))}return!1}},{"../../custom-lodash":1}],10:[function(t,e,n){var r=t("../../custom-lodash"),s=r.cloneDeepWith,l=r.isObject,p=r.isArray,y=r.reject,o=r.mergeWith,a=r.isNull;e.exports=function(t,e){return o(t,e,function(t,e,n,r){if(null==e)return null}),t=function(t,e){return s(t,function(f){return function e(t,n,r,o){if(l(t)){if(p(t))return y(t,f).map(function(t){return s(t,e)});for(var a={},i=0,u=Object.keys(t);i<u.length;i++){var c=u[i];f(t[c])||(a[c]=s(t[c],e))}return a}}}(1<arguments.length&&void 0!==e?e:function(t){return!t}))}(t,a)}},{"../../custom-lodash":1}],11:[function(t,e,n){var r=t("../../custom-lodash"),o=r.find,s=r.includes;e.exports=function(c,f){return void 0===o(Object.keys(f),function(t){var e=f[t].type,n=t&&f[t].values,r=!f[t].optional,o=c[t],a=_typeof(o),i=e&&a!==e,u=n&&!s(n,o);return r?!o||i||u:o&&(i||u)})}},{"../../custom-lodash":1}],12:[function(t,e,n){var c=t("../../custom-lodash").isEqual;e.exports=function(t,e){var n=e.event;if(Object.prototype.hasOwnProperty.call(t,n)){var r,o=_createForOfIteratorHelper(t[n].entries());try{for(o.s();!(r=o.n()).done;){var a=_slicedToArray(r.value,2),i=a[0],u=a[1];if(c(u.handler,e.handler))return i}}catch(t){o.e(t)}finally{o.f()}}return-1}},{"../../custom-lodash":1}],13:[function(t,e,n){var r=t("../../custom-lodash").has,a=t("../constants"),o=t("./ancestorRemoved");function i(t,e){return!e.data||!t.path||(r(e.data,t.path)||o(e.data,t.path))}e.exports=function(t,e){var n=t.event,r=e.config,o=!1;return e.type===a.itemType.DATA?n===a.dataLayerEvent.CHANGE&&(o=i(t,e)):e.type===a.itemType.EVENT&&(n!==a.dataLayerEvent.EVENT&&n!==r.event||(o=i(t,e)),e.data&&n===a.dataLayerEvent.CHANGE&&(o=i(t,e))),o}},{"../../custom-lodash":1,"../constants":2,"./ancestorRemoved":9}],14:[function(t,e,n){e.exports={version:"2.0.2"}},{}]},{},[4]);
//# sourceMappingURL=adobe-client-data-layer.min.js.map

/*******************************************************************************
 * Copyright 2020 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var dataLayerEnabled;
    var dataLayer;

    function addComponentToDataLayer(component) {
        dataLayer.push({
            component: getComponentObject(component)
        });
    }

    function attachClickEventListener(element) {
        element.addEventListener("click", addClickToDataLayer);
    }

    function getComponentObject(element) {
        var component = getComponentData(element);
        var componentID = Object.keys(component)[0];
        // if the component does not have a parent ID property, use the ID of the parent element
        if (component && component[componentID] && !component[componentID].parentId) {
            var parentElement = element.parentNode.closest("[data-cmp-data-layer], body");
            if (parentElement) {
                component[componentID].parentId = parentElement.id;
            }
        }

        return component;
    }

    function addClickToDataLayer(event) {
        var element = event.currentTarget;
        var componentId = getClickId(element);

        dataLayer.push({
            event: "cmp:click",
            eventInfo: {
                path: "component." + componentId
            }
        });
    }

    function getComponentData(element) {
        var dataLayerJson = element.dataset.cmpDataLayer;
        if (dataLayerJson) {
            return JSON.parse(dataLayerJson);
        } else {
            return undefined;
        }
    }

    function getClickId(element) {
        if (element.dataset.cmpDataLayer) {
            return Object.keys(JSON.parse(element.dataset.cmpDataLayer))[0];
        }

        var componentElement = element.closest("[data-cmp-data-layer]");

        return Object.keys(JSON.parse(componentElement.dataset.cmpDataLayer))[0];
    }

    function onDocumentReady() {
        dataLayerEnabled = document.body.hasAttribute("data-cmp-data-layer-enabled");
        dataLayer        = (dataLayerEnabled) ? window.adobeDataLayer = window.adobeDataLayer || [] : undefined;

        if (dataLayerEnabled) {

            var components        = document.querySelectorAll("[data-cmp-data-layer]");
            var clickableElements = document.querySelectorAll("[data-cmp-clickable]");

            components.forEach(function(component) {
                addComponentToDataLayer(component);
            });

            clickableElements.forEach(function(element) {
                attachClickEventListener(element);
            });

            dataLayer.push({
                event: "cmp:loaded"
            });
        }
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

}());

(function(){"use strict";var gu=document.createElement("style");gu.textContent=`.MenuDetails__container{display:flex;flex-direction:column;align-items:center}.MenuDetails__wrapper{box-sizing:border-box;max-width:1108px;display:flex;flex-direction:column;width:100%;padding:0 24px}@media (min-width: 992px){.MenuDetails__wrapper{padding:0}}.MenuDetails__dietary-info__wrapper{margin-top:16px}@media (min-width: 992px){.MenuDetails__dietary-info__wrapper{margin-top:24px}}.MenuDetails__sections__wrapper{display:flex;flex-direction:column;margin-top:16px;gap:38px}@media (min-width: 720px){.MenuDetails__sections__wrapper{gap:15px;margin-top:24px}}.MenuDetails__footer__wrapper{margin-top:38px;width:100%}.DietaryIcon__box{display:flex;padding:1px 0;flex-direction:column;justify-content:center;align-items:center;box-sizing:border-box}.DietaryIcon__icon{display:flex;flex-direction:column;justify-content:center;align-items:center;flex-shrink:0;border-radius:10px;border:.5px solid var(--neutralWhite);color:var(--neutralWhite);font-family:var(--secondaryFontFamily);font-size:.625rem;font-style:normal;font-weight:700;line-height:140%;text-align:center;box-sizing:border-box}.DietaryIcon__icon-small{width:16px;height:16px}.DietaryIcon__icon-large{width:20px;height:20px}.DietaryIcon__vegan{background:var(--primaryBlue1)}.DietaryIcon__vegetarian{background:var(--primaryGreen1)}.DietaryIcon__gluten-free{background:var(--primaryBrown1)}.Text{margin:0}.Text__primary{font-family:var(--primaryFontFamily)}.Text__secondary{font-family:var(--secondaryFontFamily)}.MenuActionButton__container{display:flex;flex-direction:row;border:1px solid var(--brandColor);background:var(--neutralWhite);color:var(--brandColor);height:fit-content;gap:8px;align-items:center;font-family:var(--primaryFontFamily);text-decoration:none;cursor:pointer}.MenuActionButton__text{display:inline-flex;align-items:center}.MenuActionButton__text__medium{font-size:1.125rem;font-weight:700;line-height:122%;letter-spacing:0}.MenuActionButton__text__small{font-size:.875rem;font-weight:700;line-height:129%;letter-spacing:0}.MenuActionButton__variant__medium{border-radius:6px;padding:8px 0;justify-content:center;width:100%}@media (min-width: 720px){.MenuActionButton__variant__medium{width:auto;padding:8px 16px}}.MenuActionButton__variant__small{border-radius:4px;padding:4px 12px;width:auto;justify-content:center}.MenuDietaryInfo__container{display:flex;align-items:center;justify-content:end;flex-direction:column;gap:16px}@media (min-width: 720px){.MenuDietaryInfo__container{flex-direction:row;gap:8px}}.MenuDietaryInfo__nutrition-icon{width:16px;height:16px;fill:var(--brandColor)}@media (min-width: 720px){.MenuDietaryInfo__nutrition-icon{width:12px;height:12px}}.MenuDietaryInfo__text-container{display:flex;flex-direction:row;gap:8px}.MenuDietaryInfo__text-container__dietary{gap:8px}.MenuDietaryInfo__text-container__vegan{gap:3px}.MenuDietaryInfo__text-container__vegetarian{gap:4px}.MenuFooter__container{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;width:100%;background:var(--brandColorLight);padding:22px 24px}@media (min-width: 720px){.MenuFooter__container{padding:38px 0}}.MenuFooter__wrapper{max-width:733px}.MenuFooter__description-text{margin-top:11px;font-size:1rem;font-weight:400;line-height:125%;letter-spacing:0;color:var(--bodyTextColor)}.MenuHeader__container{display:flex;flex-direction:column;padding-bottom:24px}@media (min-width: 720px){.MenuHeader__container{padding:40px 0}}.MenuHeader__wrapper{display:flex;justify-content:space-between;flex-direction:row;align-items:center}.MenuHeader__header-text{font-size:1.625rem;font-weight:700;line-height:175%;letter-spacing:0;text-align:left;color:var(--brandColor)}@media (min-width: 720px){.MenuHeader__header-text{font-size:2.25rem;font-weight:700;line-height:275%;letter-spacing:0}}.MenuHeader__description-text{font-size:1.125rem;font-weight:400;line-height:137.5%;letter-spacing:0;color:var(--bodyTextColor);margin-top:13px}@media (min-width: 720px){.MenuHeader__description-text{margin-top:23px}}.MenuHeader__serving-button{margin-top:1rem;width:100%;justify-content:center}@media (min-width: 720px){.MenuHeader__serving-button{margin-top:0;width:auto;justify-content:flex-end}}.Item__details{display:flex;padding:8px;flex-direction:column;box-sizing:border-box;justify-content:space-between;align-items:center;flex:1 0 0;height:100%}.Item__card{background-color:var(--neutralWhite);border:1px solid var(--neutralGray5);border-radius:8px;overflow:hidden;box-sizing:border-box;display:flex;justify-content:space-between;align-items:flex-start;align-self:stretch;height:152px;position:relative;cursor:pointer;box-shadow:0 4px 16px 0 var(--boxShadow1)}.Item__featured{background-color:var(--featuredItemBackgroundColor, var(--neutralWhite))}.Item__name-description-box{display:flex;flex-direction:column;gap:2px;flex-shrink:0;align-self:stretch;height:102px}.Item__name{font-size:1.125rem;font-weight:700;line-height:111.111%;overflow:hidden;font-variant-numeric:lining-nums proportional-nums;text-overflow:ellipsis;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;align-self:stretch;color:var(--brandColor);margin:0}.Item__featured-name{color:var(--featuredItemTextColor, var(--brandColor))}.Item__description{font-size:.875rem;font-weight:400;line-height:128.571%;margin:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;align-self:stretch;color:var(--bodyTextColor)}.Item__featured-description{color:var(--featuredItemTextColor, var(--bodyTextColor))}.Item__image-box{display:flex;flex-direction:column;justify-content:center;align-items:center;margin:0}.Item__img{width:150px;height:152px;flex-shrink:0}.Item__featured-box{display:flex;padding:0 5px 8px;flex-direction:column;align-items:flex-start;gap:10px;position:absolute;right:0;bottom:0;box-sizing:border-box}.Item__nutrition-and-abv{display:flex}.Modal-menu-item{padding:16px;gap:16px}@media (min-width: 720px){.Modal-menu-item{padding:24px;gap:20px}}.Abv__text{font-size:.75rem;font-style:normal;font-weight:400;line-height:133.333%;color:var(--bodyTextColor)}.Abv__text-modal{font-size:1.125rem;font-style:normal;font-weight:400;line-height:122%;color:var(--bodyTextColor)}.Abv__featured{color:var(--featuredItemTextColor, var(--bodyTextColor))}.body-no-scroll{overflow:hidden;height:100%;width:100%}.Modal__box{position:fixed;top:0;left:0;right:0;bottom:0;background-color:#00000080;display:flex;justify-content:center;padding-top:108px;z-index:1}@media (min-width: 720px){.Modal__box{padding-top:258px}}.Modal__modal{position:absolute;width:327px;display:flex;justify-content:center;flex-direction:column;background-color:var(--neutralWhite);border-radius:8px;box-sizing:border-box}@media (min-width: 720px){.Modal__modal{width:732px}}.Modal__close-button-box{display:flex;justify-content:flex-end}.Modal__close-button{cursor:pointer}.Nutrition__energyKcalPerPortion{font-size:.75rem;font-style:normal;font-weight:400;line-height:133.333%;color:var(--bodyTextColor)}.Nutrition__energyKcalPerPortion-modal{font-size:1.125rem;font-style:normal;font-weight:400;line-height:122%;color:var(--bodyTextColor)}.Nutrition__featured{color:var(--featuredItemTextColor, var(--bodyTextColor))}.Featured__box{display:flex;padding:4px 10px 3px 7px;justify-content:center;align-items:center;gap:7px;border-radius:4px;background:var(--neutralWhite);width:100%;box-sizing:border-box}.Featured__modal{background-color:var(--neutralGray2);padding:4px 6px;align-items:center;gap:8px}@media (min-width: 720px){.Featured__modal{padding:6px}}.Featured__text{color:var(--neutralBlack);text-align:center;font-size:.655rem;font-style:normal;font-weight:700;line-height:140%}.Featured__text-modal{text-align:center;font-size:.625rem;font-style:normal;font-weight:700;line-height:140%}@media (min-width: 720px){.Featured__text-modal{font-size:.875rem;line-height:130%}}.Featured__icon{width:15px;height:14px;flex-shrink:0;fill:var(--neutralBlack)}.MenuItemModalContent__box{display:flex;flex-direction:column;gap:16px}@media (min-width: 720px){.MenuItemModalContent__box{gap:20px}}.MenuItemModalContent__name-description-box{display:flex;flex-direction:column;gap:4px}.MenuItemModalContent__price-and-dietary-info-featured{display:flex;justify-content:space-between;border-bottom:1px solid var(--neutralGray3);padding-bottom:16px}.MenuItemModalContent__name{font-size:1.625rem;font-weight:700;line-height:108%;color:var(--brandColor)}@media (min-width: 720px){.MenuItemModalContent__name{font-size:2.25rem;line-height:122%}}.MenuItemModalContent__description{font-size:1.125rem;font-weight:400;line-height:122%;color:var(--bodyTextColor)}.MenuItemModalContent__nutrition-and-abv,.MenuItemModalContent__nutrition-and-allergy-info{display:flex}.MenuItemModalContent__nutrition-icon{width:16px;height:16px;fill:var(--brandColor)}.PriceAndDietaryInfo__box{display:flex;align-items:flex-end;gap:4px;align-self:stretch}.PriceAndDietaryInfo__modal{gap:16px}.PriceAndDietaryInfo__price{font-size:1rem;font-style:normal;font-weight:700;line-height:125%;color:var(--brandColor)}.PriceAndDietaryInfo__featured-price{color:var(--featuredItemTextColor, var(--brandColor))}.PriceAndDietaryInfo__dietary-icons{display:flex;padding-bottom:2px;align-items:center;gap:2px}.MenuSubSection__container{display:flex;flex-direction:column;gap:16px}@media (min-width: 720px){.MenuSubSection__container{gap:24px}}.MenuSubSection__title{padding:16px 0 0;font-size:1.5rem;line-height:187.5%;letter-spacing:0;color:var(--brandColor)}@media (min-width: 720px){.MenuSubSection__title{font-size:1.625rem;font-weight:700;line-height:175%;padding:24px 0 0}}.MenuSubSection__title__subsection{font-size:1.125rem;font-weight:700;line-height:125%;letter-spacing:0}@media (min-width: 720px){.MenuSubSection__title__subsection{font-size:1.5rem;font-weight:700;line-height:187.5%;letter-spacing:0}}.MenuSubSection__items-grid{display:grid;grid-template-columns:1fr;column-gap:10px;row-gap:24px}@media (min-width: 720px){.MenuSubSection__items-grid{grid-template-columns:1fr 1fr;row-gap:20px}}@media (min-width: 992px){.MenuSubSection__items-grid{grid-template-columns:1fr 1fr 1fr}}.MenuSubSection__heading-and-caption{display:flex;flex-direction:column}.MenuSubSection__caption{padding:12px 0 4px;color:var(--bodyTextColor);font-size:1.125rem;line-height:1.375rem;font-weight:400}@media (min-width: 720px){.MenuSubSection__caption{padding:20px 0 4px}}:root{--neutralBlack: #000000;--neutralBlack1: #2d3445;--neutralWhite: #ffffff;--neutralGray2: #f7f7f7;--neutralGray3: #e0e0e0;--neutralGray4: #545356;--neutralGray5: #efefef;--boxShadow1: #0000000d;--primaryGreen1: #008a27;--primaryBlue1: #007272;--primaryBrown1: #9f6a12}.MenuSection__wrapper{display:flex;flex-direction:column;border:1px solid var(--brandColor);border-radius:var(--brandSectionRoundedCorners);overflow:hidden;margin-top:12px}.MenuSection__container{padding:0 24px 24px}.MenuSection__heading{padding:16px 24px 12px;background:var(--brandColor)}@media (min-width: 720px){.MenuSection__heading{padding:20px 24px 16px}}.MenuSection__title{color:var(--neutralWhite);font-size:1.5rem;line-height:187.5%;font-weight:700;letter-spacing:0}@media (min-width: 720px){.MenuSection__title{font-size:1.625rem;line-height:175%}}.MenuSection__subsection-wrapper{display:flex;flex-direction:column;gap:37px;padding-bottom:4px}.MenuSection__heading-and-caption{display:flex;flex-direction:column}.MenuSection__caption{padding:12px 24px 4px;color:var(--bodyTextColor);font-size:1.125rem;line-height:1.375rem;font-weight:400}@media (min-width: 720px){.MenuSection__caption{padding:16px 24px 4px}}
`,document.head.appendChild(gu);function _u(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}var xu={exports:{}},yr={},wu={exports:{}},F={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Cn=Symbol.for("react.element"),_f=Symbol.for("react.portal"),xf=Symbol.for("react.fragment"),wf=Symbol.for("react.strict_mode"),Sf=Symbol.for("react.profiler"),Cf=Symbol.for("react.provider"),kf=Symbol.for("react.context"),Ef=Symbol.for("react.forward_ref"),Mf=Symbol.for("react.suspense"),Pf=Symbol.for("react.memo"),Nf=Symbol.for("react.lazy"),Su=Symbol.iterator;function If(e){return e===null||typeof e!="object"?null:(e=Su&&e[Su]||e["@@iterator"],typeof e=="function"?e:null)}var Cu={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},ku=Object.assign,Eu={};function qt(e,t,n){this.props=e,this.context=t,this.refs=Eu,this.updater=n||Cu}qt.prototype.isReactComponent={},qt.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")},qt.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function Mu(){}Mu.prototype=qt.prototype;function Ki(e,t,n){this.props=e,this.context=t,this.refs=Eu,this.updater=n||Cu}var qi=Ki.prototype=new Mu;qi.constructor=Ki,ku(qi,qt.prototype),qi.isPureReactComponent=!0;var Pu=Array.isArray,Nu=Object.prototype.hasOwnProperty,bi={current:null},Iu={key:!0,ref:!0,__self:!0,__source:!0};function Ou(e,t,n){var r,i={},o=null,l=null;if(t!=null)for(r in t.ref!==void 0&&(l=t.ref),t.key!==void 0&&(o=""+t.key),t)Nu.call(t,r)&&!Iu.hasOwnProperty(r)&&(i[r]=t[r]);var u=arguments.length-2;if(u===1)i.children=n;else if(1<u){for(var s=Array(u),a=0;a<u;a++)s[a]=arguments[a+2];i.children=s}if(e&&e.defaultProps)for(r in u=e.defaultProps,u)i[r]===void 0&&(i[r]=u[r]);return{$$typeof:Cn,type:e,key:o,ref:l,props:i,_owner:bi.current}}function Of(e,t){return{$$typeof:Cn,type:e.type,key:t,ref:e.ref,props:e.props,_owner:e._owner}}function Gi(e){return typeof e=="object"&&e!==null&&e.$$typeof===Cn}function Df(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(n){return t[n]})}var Du=/\/+/g;function Yi(e,t){return typeof e=="object"&&e!==null&&e.key!=null?Df(""+e.key):t.toString(36)}function gr(e,t,n,r,i){var o=typeof e;(o==="undefined"||o==="boolean")&&(e=null);var l=!1;if(e===null)l=!0;else switch(o){case"string":case"number":l=!0;break;case"object":switch(e.$$typeof){case Cn:case _f:l=!0}}if(l)return l=e,i=i(l),e=r===""?"."+Yi(l,0):r,Pu(i)?(n="",e!=null&&(n=e.replace(Du,"$&/")+"/"),gr(i,t,n,"",function(a){return a})):i!=null&&(Gi(i)&&(i=Of(i,n+(!i.key||l&&l.key===i.key?"":(""+i.key).replace(Du,"$&/")+"/")+e)),t.push(i)),1;if(l=0,r=r===""?".":r+":",Pu(e))for(var u=0;u<e.length;u++){o=e[u];var s=r+Yi(o,u);l+=gr(o,t,n,s,i)}else if(s=If(e),typeof s=="function")for(e=s.call(e),u=0;!(o=e.next()).done;)o=o.value,s=r+Yi(o,u++),l+=gr(o,t,n,s,i);else if(o==="object")throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.");return l}function _r(e,t,n){if(e==null)return e;var r=[],i=0;return gr(e,r,"","",function(o){return t.call(n,o,i++)}),r}function Ff(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(n){(e._status===0||e._status===-1)&&(e._status=1,e._result=n)},function(n){(e._status===0||e._status===-1)&&(e._status=2,e._result=n)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var de={current:null},xr={transition:null},Lf={ReactCurrentDispatcher:de,ReactCurrentBatchConfig:xr,ReactCurrentOwner:bi};F.Children={map:_r,forEach:function(e,t,n){_r(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return _r(e,function(){t++}),t},toArray:function(e){return _r(e,function(t){return t})||[]},only:function(e){if(!Gi(e))throw Error("React.Children.only expected to receive a single React element child.");return e}},F.Component=qt,F.Fragment=xf,F.Profiler=Sf,F.PureComponent=Ki,F.StrictMode=wf,F.Suspense=Mf,F.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Lf,F.cloneElement=function(e,t,n){if(e==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+e+".");var r=ku({},e.props),i=e.key,o=e.ref,l=e._owner;if(t!=null){if(t.ref!==void 0&&(o=t.ref,l=bi.current),t.key!==void 0&&(i=""+t.key),e.type&&e.type.defaultProps)var u=e.type.defaultProps;for(s in t)Nu.call(t,s)&&!Iu.hasOwnProperty(s)&&(r[s]=t[s]===void 0&&u!==void 0?u[s]:t[s])}var s=arguments.length-2;if(s===1)r.children=n;else if(1<s){u=Array(s);for(var a=0;a<s;a++)u[a]=arguments[a+2];r.children=u}return{$$typeof:Cn,type:e.type,key:i,ref:o,props:r,_owner:l}},F.createContext=function(e){return e={$$typeof:kf,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},e.Provider={$$typeof:Cf,_context:e},e.Consumer=e},F.createElement=Ou,F.createFactory=function(e){var t=Ou.bind(null,e);return t.type=e,t},F.createRef=function(){return{current:null}},F.forwardRef=function(e){return{$$typeof:Ef,render:e}},F.isValidElement=Gi,F.lazy=function(e){return{$$typeof:Nf,_payload:{_status:-1,_result:e},_init:Ff}},F.memo=function(e,t){return{$$typeof:Pf,type:e,compare:t===void 0?null:t}},F.startTransition=function(e){var t=xr.transition;xr.transition={};try{e()}finally{xr.transition=t}},F.unstable_act=function(){throw Error("act(...) is not supported in production builds of React.")},F.useCallback=function(e,t){return de.current.useCallback(e,t)},F.useContext=function(e){return de.current.useContext(e)},F.useDebugValue=function(){},F.useDeferredValue=function(e){return de.current.useDeferredValue(e)},F.useEffect=function(e,t){return de.current.useEffect(e,t)},F.useId=function(){return de.current.useId()},F.useImperativeHandle=function(e,t,n){return de.current.useImperativeHandle(e,t,n)},F.useInsertionEffect=function(e,t){return de.current.useInsertionEffect(e,t)},F.useLayoutEffect=function(e,t){return de.current.useLayoutEffect(e,t)},F.useMemo=function(e,t){return de.current.useMemo(e,t)},F.useReducer=function(e,t,n){return de.current.useReducer(e,t,n)},F.useRef=function(e){return de.current.useRef(e)},F.useState=function(e){return de.current.useState(e)},F.useSyncExternalStore=function(e,t,n){return de.current.useSyncExternalStore(e,t,n)},F.useTransition=function(){return de.current.useTransition()},F.version="18.2.0",wu.exports=F;var J=wu.exports;const oe=_u(J);/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Tf=J,jf=Symbol.for("react.element"),Rf=Symbol.for("react.fragment"),zf=Object.prototype.hasOwnProperty,Af=Tf.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,Uf={key:!0,ref:!0,__self:!0,__source:!0};function Fu(e,t,n){var r,i={},o=null,l=null;n!==void 0&&(o=""+n),t.key!==void 0&&(o=""+t.key),t.ref!==void 0&&(l=t.ref);for(r in t)zf.call(t,r)&&!Uf.hasOwnProperty(r)&&(i[r]=t[r]);if(e&&e.defaultProps)for(r in t=e.defaultProps,t)i[r]===void 0&&(i[r]=t[r]);return{$$typeof:jf,type:e,key:o,ref:l,props:i,_owner:Af.current}}yr.Fragment=Rf,yr.jsx=Fu,yr.jsxs=Fu,xu.exports=yr;var g=xu.exports;function Xi(e,t){return Xi=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(r,i){return r.__proto__=i,r},Xi(e,t)}function kn(e,t){e.prototype=Object.create(t.prototype),e.prototype.constructor=e,Xi(e,t)}var En=function(){function e(){this.listeners=[]}var t=e.prototype;return t.subscribe=function(r){var i=this,o=r||function(){};return this.listeners.push(o),this.onSubscribe(),function(){i.listeners=i.listeners.filter(function(l){return l!==o}),i.onUnsubscribe()}},t.hasListeners=function(){return this.listeners.length>0},t.onSubscribe=function(){},t.onUnsubscribe=function(){},e}();function T(){return T=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e},T.apply(this,arguments)}var wr=typeof window>"u";function le(){}function Qf(e,t){return typeof e=="function"?e(t):e}function Zi(e){return typeof e=="number"&&e>=0&&e!==1/0}function Sr(e){return Array.isArray(e)?e:[e]}function Lu(e,t){return Math.max(e+(t||0)-Date.now(),0)}function Cr(e,t,n){return Mr(e)?typeof t=="function"?T({},n,{queryKey:e,queryFn:t}):T({},t,{queryKey:e}):e}function lt(e,t,n){return Mr(e)?[T({},t,{queryKey:e}),n]:[e||{},t]}function $f(e,t){if(e===!0&&t===!0||e==null&&t==null)return"all";if(e===!1&&t===!1)return"none";var n=e??!t;return n?"active":"inactive"}function Tu(e,t){var n=e.active,r=e.exact,i=e.fetching,o=e.inactive,l=e.predicate,u=e.queryKey,s=e.stale;if(Mr(u)){if(r){if(t.queryHash!==Ji(u,t.options))return!1}else if(!kr(t.queryKey,u))return!1}var a=$f(n,o);if(a==="none")return!1;if(a!=="all"){var m=t.isActive();if(a==="active"&&!m||a==="inactive"&&m)return!1}return!(typeof s=="boolean"&&t.isStale()!==s||typeof i=="boolean"&&t.isFetching()!==i||l&&!l(t))}function ju(e,t){var n=e.exact,r=e.fetching,i=e.predicate,o=e.mutationKey;if(Mr(o)){if(!t.options.mutationKey)return!1;if(n){if(It(t.options.mutationKey)!==It(o))return!1}else if(!kr(t.options.mutationKey,o))return!1}return!(typeof r=="boolean"&&t.state.status==="loading"!==r||i&&!i(t))}function Ji(e,t){var n=(t==null?void 0:t.queryKeyHashFn)||It;return n(e)}function It(e){var t=Sr(e);return Bf(t)}function Bf(e){return JSON.stringify(e,function(t,n){return eo(n)?Object.keys(n).sort().reduce(function(r,i){return r[i]=n[i],r},{}):n})}function kr(e,t){return Ru(Sr(e),Sr(t))}function Ru(e,t){return e===t?!0:typeof e!=typeof t?!1:e&&t&&typeof e=="object"&&typeof t=="object"?!Object.keys(t).some(function(n){return!Ru(e[n],t[n])}):!1}function Er(e,t){if(e===t)return e;var n=Array.isArray(e)&&Array.isArray(t);if(n||eo(e)&&eo(t)){for(var r=n?e.length:Object.keys(e).length,i=n?t:Object.keys(t),o=i.length,l=n?[]:{},u=0,s=0;s<o;s++){var a=n?s:i[s];l[a]=Er(e[a],t[a]),l[a]===e[a]&&u++}return r===o&&u===r?e:l}return t}function Vf(e,t){if(e&&!t||t&&!e)return!1;for(var n in e)if(e[n]!==t[n])return!1;return!0}function eo(e){if(!zu(e))return!1;var t=e.constructor;if(typeof t>"u")return!0;var n=t.prototype;return!(!zu(n)||!n.hasOwnProperty("isPrototypeOf"))}function zu(e){return Object.prototype.toString.call(e)==="[object Object]"}function Mr(e){return typeof e=="string"||Array.isArray(e)}function Wf(e){return new Promise(function(t){setTimeout(t,e)})}function Au(e){Promise.resolve().then(e).catch(function(t){return setTimeout(function(){throw t})})}function Uu(){if(typeof AbortController=="function")return new AbortController}var Hf=function(e){kn(t,e);function t(){var r;return r=e.call(this)||this,r.setup=function(i){var o;if(!wr&&((o=window)!=null&&o.addEventListener)){var l=function(){return i()};return window.addEventListener("visibilitychange",l,!1),window.addEventListener("focus",l,!1),function(){window.removeEventListener("visibilitychange",l),window.removeEventListener("focus",l)}}},r}var n=t.prototype;return n.onSubscribe=function(){this.cleanup||this.setEventListener(this.setup)},n.onUnsubscribe=function(){if(!this.hasListeners()){var i;(i=this.cleanup)==null||i.call(this),this.cleanup=void 0}},n.setEventListener=function(i){var o,l=this;this.setup=i,(o=this.cleanup)==null||o.call(this),this.cleanup=i(function(u){typeof u=="boolean"?l.setFocused(u):l.onFocus()})},n.setFocused=function(i){this.focused=i,i&&this.onFocus()},n.onFocus=function(){this.listeners.forEach(function(i){i()})},n.isFocused=function(){return typeof this.focused=="boolean"?this.focused:typeof document>"u"?!0:[void 0,"visible","prerender"].includes(document.visibilityState)},t}(En),Mn=new Hf,Kf=function(e){kn(t,e);function t(){var r;return r=e.call(this)||this,r.setup=function(i){var o;if(!wr&&((o=window)!=null&&o.addEventListener)){var l=function(){return i()};return window.addEventListener("online",l,!1),window.addEventListener("offline",l,!1),function(){window.removeEventListener("online",l),window.removeEventListener("offline",l)}}},r}var n=t.prototype;return n.onSubscribe=function(){this.cleanup||this.setEventListener(this.setup)},n.onUnsubscribe=function(){if(!this.hasListeners()){var i;(i=this.cleanup)==null||i.call(this),this.cleanup=void 0}},n.setEventListener=function(i){var o,l=this;this.setup=i,(o=this.cleanup)==null||o.call(this),this.cleanup=i(function(u){typeof u=="boolean"?l.setOnline(u):l.onOnline()})},n.setOnline=function(i){this.online=i,i&&this.onOnline()},n.onOnline=function(){this.listeners.forEach(function(i){i()})},n.isOnline=function(){return typeof this.online=="boolean"?this.online:typeof navigator>"u"||typeof navigator.onLine>"u"?!0:navigator.onLine},t}(En),Pr=new Kf;function qf(e){return Math.min(1e3*Math.pow(2,e),3e4)}function Nr(e){return typeof(e==null?void 0:e.cancel)=="function"}var Qu=function(t){this.revert=t==null?void 0:t.revert,this.silent=t==null?void 0:t.silent};function Ir(e){return e instanceof Qu}var $u=function(t){var n=this,r=!1,i,o,l,u;this.abort=t.abort,this.cancel=function(p){return i==null?void 0:i(p)},this.cancelRetry=function(){r=!0},this.continueRetry=function(){r=!1},this.continue=function(){return o==null?void 0:o()},this.failureCount=0,this.isPaused=!1,this.isResolved=!1,this.isTransportCancelable=!1,this.promise=new Promise(function(p,v){l=p,u=v});var s=function(v){n.isResolved||(n.isResolved=!0,t.onSuccess==null||t.onSuccess(v),o==null||o(),l(v))},a=function(v){n.isResolved||(n.isResolved=!0,t.onError==null||t.onError(v),o==null||o(),u(v))},m=function(){return new Promise(function(v){o=v,n.isPaused=!0,t.onPause==null||t.onPause()}).then(function(){o=void 0,n.isPaused=!1,t.onContinue==null||t.onContinue()})},h=function p(){if(!n.isResolved){var v;try{v=t.fn()}catch(y){v=Promise.reject(y)}i=function(_){if(!n.isResolved&&(a(new Qu(_)),n.abort==null||n.abort(),Nr(v)))try{v.cancel()}catch{}},n.isTransportCancelable=Nr(v),Promise.resolve(v).then(s).catch(function(y){var _,O;if(!n.isResolved){var d=(_=t.retry)!=null?_:3,c=(O=t.retryDelay)!=null?O:qf,f=typeof c=="function"?c(n.failureCount,y):c,x=d===!0||typeof d=="number"&&n.failureCount<d||typeof d=="function"&&d(n.failureCount,y);if(r||!x){a(y);return}n.failureCount++,t.onFail==null||t.onFail(n.failureCount,y),Wf(f).then(function(){if(!Mn.isFocused()||!Pr.isOnline())return m()}).then(function(){r?a(y):p()})}})}};h()},bf=function(){function e(){this.queue=[],this.transactions=0,this.notifyFn=function(n){n()},this.batchNotifyFn=function(n){n()}}var t=e.prototype;return t.batch=function(r){var i;this.transactions++;try{i=r()}finally{this.transactions--,this.transactions||this.flush()}return i},t.schedule=function(r){var i=this;this.transactions?this.queue.push(r):Au(function(){i.notifyFn(r)})},t.batchCalls=function(r){var i=this;return function(){for(var o=arguments.length,l=new Array(o),u=0;u<o;u++)l[u]=arguments[u];i.schedule(function(){r.apply(void 0,l)})}},t.flush=function(){var r=this,i=this.queue;this.queue=[],i.length&&Au(function(){r.batchNotifyFn(function(){i.forEach(function(o){r.notifyFn(o)})})})},t.setNotifyFunction=function(r){this.notifyFn=r},t.setBatchNotifyFunction=function(r){this.batchNotifyFn=r},e}(),H=new bf,Bu=console;function Or(){return Bu}function Gf(e){Bu=e}var Yf=function(){function e(n){this.abortSignalConsumed=!1,this.hadObservers=!1,this.defaultOptions=n.defaultOptions,this.setOptions(n.options),this.observers=[],this.cache=n.cache,this.queryKey=n.queryKey,this.queryHash=n.queryHash,this.initialState=n.state||this.getDefaultState(this.options),this.state=this.initialState,this.meta=n.meta,this.scheduleGc()}var t=e.prototype;return t.setOptions=function(r){var i;this.options=T({},this.defaultOptions,r),this.meta=r==null?void 0:r.meta,this.cacheTime=Math.max(this.cacheTime||0,(i=this.options.cacheTime)!=null?i:5*60*1e3)},t.setDefaultOptions=function(r){this.defaultOptions=r},t.scheduleGc=function(){var r=this;this.clearGcTimeout(),Zi(this.cacheTime)&&(this.gcTimeout=setTimeout(function(){r.optionalRemove()},this.cacheTime))},t.clearGcTimeout=function(){this.gcTimeout&&(clearTimeout(this.gcTimeout),this.gcTimeout=void 0)},t.optionalRemove=function(){this.observers.length||(this.state.isFetching?this.hadObservers&&this.scheduleGc():this.cache.remove(this))},t.setData=function(r,i){var o,l,u=this.state.data,s=Qf(r,u);return(o=(l=this.options).isDataEqual)!=null&&o.call(l,u,s)?s=u:this.options.structuralSharing!==!1&&(s=Er(u,s)),this.dispatch({data:s,type:"success",dataUpdatedAt:i==null?void 0:i.updatedAt}),s},t.setState=function(r,i){this.dispatch({type:"setState",state:r,setStateOptions:i})},t.cancel=function(r){var i,o=this.promise;return(i=this.retryer)==null||i.cancel(r),o?o.then(le).catch(le):Promise.resolve()},t.destroy=function(){this.clearGcTimeout(),this.cancel({silent:!0})},t.reset=function(){this.destroy(),this.setState(this.initialState)},t.isActive=function(){return this.observers.some(function(r){return r.options.enabled!==!1})},t.isFetching=function(){return this.state.isFetching},t.isStale=function(){return this.state.isInvalidated||!this.state.dataUpdatedAt||this.observers.some(function(r){return r.getCurrentResult().isStale})},t.isStaleByTime=function(r){return r===void 0&&(r=0),this.state.isInvalidated||!this.state.dataUpdatedAt||!Lu(this.state.dataUpdatedAt,r)},t.onFocus=function(){var r,i=this.observers.find(function(o){return o.shouldFetchOnWindowFocus()});i&&i.refetch(),(r=this.retryer)==null||r.continue()},t.onOnline=function(){var r,i=this.observers.find(function(o){return o.shouldFetchOnReconnect()});i&&i.refetch(),(r=this.retryer)==null||r.continue()},t.addObserver=function(r){this.observers.indexOf(r)===-1&&(this.observers.push(r),this.hadObservers=!0,this.clearGcTimeout(),this.cache.notify({type:"observerAdded",query:this,observer:r}))},t.removeObserver=function(r){this.observers.indexOf(r)!==-1&&(this.observers=this.observers.filter(function(i){return i!==r}),this.observers.length||(this.retryer&&(this.retryer.isTransportCancelable||this.abortSignalConsumed?this.retryer.cancel({revert:!0}):this.retryer.cancelRetry()),this.cacheTime?this.scheduleGc():this.cache.remove(this)),this.cache.notify({type:"observerRemoved",query:this,observer:r}))},t.getObserversCount=function(){return this.observers.length},t.invalidate=function(){this.state.isInvalidated||this.dispatch({type:"invalidate"})},t.fetch=function(r,i){var o=this,l,u,s;if(this.state.isFetching){if(this.state.dataUpdatedAt&&(i!=null&&i.cancelRefetch))this.cancel({silent:!0});else if(this.promise){var a;return(a=this.retryer)==null||a.continueRetry(),this.promise}}if(r&&this.setOptions(r),!this.options.queryFn){var m=this.observers.find(function(c){return c.options.queryFn});m&&this.setOptions(m.options)}var h=Sr(this.queryKey),p=Uu(),v={queryKey:h,pageParam:void 0,meta:this.meta};Object.defineProperty(v,"signal",{enumerable:!0,get:function(){if(p)return o.abortSignalConsumed=!0,p.signal}});var y=function(){return o.options.queryFn?(o.abortSignalConsumed=!1,o.options.queryFn(v)):Promise.reject("Missing queryFn")},_={fetchOptions:i,options:this.options,queryKey:h,state:this.state,fetchFn:y,meta:this.meta};if((l=this.options.behavior)!=null&&l.onFetch){var O;(O=this.options.behavior)==null||O.onFetch(_)}if(this.revertState=this.state,!this.state.isFetching||this.state.fetchMeta!==((u=_.fetchOptions)==null?void 0:u.meta)){var d;this.dispatch({type:"fetch",meta:(d=_.fetchOptions)==null?void 0:d.meta})}return this.retryer=new $u({fn:_.fetchFn,abort:p==null||(s=p.abort)==null?void 0:s.bind(p),onSuccess:function(f){o.setData(f),o.cache.config.onSuccess==null||o.cache.config.onSuccess(f,o),o.cacheTime===0&&o.optionalRemove()},onError:function(f){Ir(f)&&f.silent||o.dispatch({type:"error",error:f}),Ir(f)||(o.cache.config.onError==null||o.cache.config.onError(f,o),Or().error(f)),o.cacheTime===0&&o.optionalRemove()},onFail:function(){o.dispatch({type:"failed"})},onPause:function(){o.dispatch({type:"pause"})},onContinue:function(){o.dispatch({type:"continue"})},retry:_.options.retry,retryDelay:_.options.retryDelay}),this.promise=this.retryer.promise,this.promise},t.dispatch=function(r){var i=this;this.state=this.reducer(this.state,r),H.batch(function(){i.observers.forEach(function(o){o.onQueryUpdate(r)}),i.cache.notify({query:i,type:"queryUpdated",action:r})})},t.getDefaultState=function(r){var i=typeof r.initialData=="function"?r.initialData():r.initialData,o=typeof r.initialData<"u",l=o?typeof r.initialDataUpdatedAt=="function"?r.initialDataUpdatedAt():r.initialDataUpdatedAt:0,u=typeof i<"u";return{data:i,dataUpdateCount:0,dataUpdatedAt:u?l??Date.now():0,error:null,errorUpdateCount:0,errorUpdatedAt:0,fetchFailureCount:0,fetchMeta:null,isFetching:!1,isInvalidated:!1,isPaused:!1,status:u?"success":"idle"}},t.reducer=function(r,i){var o,l;switch(i.type){case"failed":return T({},r,{fetchFailureCount:r.fetchFailureCount+1});case"pause":return T({},r,{isPaused:!0});case"continue":return T({},r,{isPaused:!1});case"fetch":return T({},r,{fetchFailureCount:0,fetchMeta:(o=i.meta)!=null?o:null,isFetching:!0,isPaused:!1},!r.dataUpdatedAt&&{error:null,status:"loading"});case"success":return T({},r,{data:i.data,dataUpdateCount:r.dataUpdateCount+1,dataUpdatedAt:(l=i.dataUpdatedAt)!=null?l:Date.now(),error:null,fetchFailureCount:0,isFetching:!1,isInvalidated:!1,isPaused:!1,status:"success"});case"error":var u=i.error;return Ir(u)&&u.revert&&this.revertState?T({},this.revertState):T({},r,{error:u,errorUpdateCount:r.errorUpdateCount+1,errorUpdatedAt:Date.now(),fetchFailureCount:r.fetchFailureCount+1,isFetching:!1,isPaused:!1,status:"error"});case"invalidate":return T({},r,{isInvalidated:!0});case"setState":return T({},r,i.state);default:return r}},e}(),Xf=function(e){kn(t,e);function t(r){var i;return i=e.call(this)||this,i.config=r||{},i.queries=[],i.queriesMap={},i}var n=t.prototype;return n.build=function(i,o,l){var u,s=o.queryKey,a=(u=o.queryHash)!=null?u:Ji(s,o),m=this.get(a);return m||(m=new Yf({cache:this,queryKey:s,queryHash:a,options:i.defaultQueryOptions(o),state:l,defaultOptions:i.getQueryDefaults(s),meta:o.meta}),this.add(m)),m},n.add=function(i){this.queriesMap[i.queryHash]||(this.queriesMap[i.queryHash]=i,this.queries.push(i),this.notify({type:"queryAdded",query:i}))},n.remove=function(i){var o=this.queriesMap[i.queryHash];o&&(i.destroy(),this.queries=this.queries.filter(function(l){return l!==i}),o===i&&delete this.queriesMap[i.queryHash],this.notify({type:"queryRemoved",query:i}))},n.clear=function(){var i=this;H.batch(function(){i.queries.forEach(function(o){i.remove(o)})})},n.get=function(i){return this.queriesMap[i]},n.getAll=function(){return this.queries},n.find=function(i,o){var l=lt(i,o),u=l[0];return typeof u.exact>"u"&&(u.exact=!0),this.queries.find(function(s){return Tu(u,s)})},n.findAll=function(i,o){var l=lt(i,o),u=l[0];return Object.keys(u).length>0?this.queries.filter(function(s){return Tu(u,s)}):this.queries},n.notify=function(i){var o=this;H.batch(function(){o.listeners.forEach(function(l){l(i)})})},n.onFocus=function(){var i=this;H.batch(function(){i.queries.forEach(function(o){o.onFocus()})})},n.onOnline=function(){var i=this;H.batch(function(){i.queries.forEach(function(o){o.onOnline()})})},t}(En),Zf=function(){function e(n){this.options=T({},n.defaultOptions,n.options),this.mutationId=n.mutationId,this.mutationCache=n.mutationCache,this.observers=[],this.state=n.state||Jf(),this.meta=n.meta}var t=e.prototype;return t.setState=function(r){this.dispatch({type:"setState",state:r})},t.addObserver=function(r){this.observers.indexOf(r)===-1&&this.observers.push(r)},t.removeObserver=function(r){this.observers=this.observers.filter(function(i){return i!==r})},t.cancel=function(){return this.retryer?(this.retryer.cancel(),this.retryer.promise.then(le).catch(le)):Promise.resolve()},t.continue=function(){return this.retryer?(this.retryer.continue(),this.retryer.promise):this.execute()},t.execute=function(){var r=this,i,o=this.state.status==="loading",l=Promise.resolve();return o||(this.dispatch({type:"loading",variables:this.options.variables}),l=l.then(function(){r.mutationCache.config.onMutate==null||r.mutationCache.config.onMutate(r.state.variables,r)}).then(function(){return r.options.onMutate==null?void 0:r.options.onMutate(r.state.variables)}).then(function(u){u!==r.state.context&&r.dispatch({type:"loading",context:u,variables:r.state.variables})})),l.then(function(){return r.executeMutation()}).then(function(u){i=u,r.mutationCache.config.onSuccess==null||r.mutationCache.config.onSuccess(i,r.state.variables,r.state.context,r)}).then(function(){return r.options.onSuccess==null?void 0:r.options.onSuccess(i,r.state.variables,r.state.context)}).then(function(){return r.options.onSettled==null?void 0:r.options.onSettled(i,null,r.state.variables,r.state.context)}).then(function(){return r.dispatch({type:"success",data:i}),i}).catch(function(u){return r.mutationCache.config.onError==null||r.mutationCache.config.onError(u,r.state.variables,r.state.context,r),Or().error(u),Promise.resolve().then(function(){return r.options.onError==null?void 0:r.options.onError(u,r.state.variables,r.state.context)}).then(function(){return r.options.onSettled==null?void 0:r.options.onSettled(void 0,u,r.state.variables,r.state.context)}).then(function(){throw r.dispatch({type:"error",error:u}),u})})},t.executeMutation=function(){var r=this,i;return this.retryer=new $u({fn:function(){return r.options.mutationFn?r.options.mutationFn(r.state.variables):Promise.reject("No mutationFn found")},onFail:function(){r.dispatch({type:"failed"})},onPause:function(){r.dispatch({type:"pause"})},onContinue:function(){r.dispatch({type:"continue"})},retry:(i=this.options.retry)!=null?i:0,retryDelay:this.options.retryDelay}),this.retryer.promise},t.dispatch=function(r){var i=this;this.state=ed(this.state,r),H.batch(function(){i.observers.forEach(function(o){o.onMutationUpdate(r)}),i.mutationCache.notify(i)})},e}();function Jf(){return{context:void 0,data:void 0,error:null,failureCount:0,isPaused:!1,status:"idle",variables:void 0}}function ed(e,t){switch(t.type){case"failed":return T({},e,{failureCount:e.failureCount+1});case"pause":return T({},e,{isPaused:!0});case"continue":return T({},e,{isPaused:!1});case"loading":return T({},e,{context:t.context,data:void 0,error:null,isPaused:!1,status:"loading",variables:t.variables});case"success":return T({},e,{data:t.data,error:null,status:"success",isPaused:!1});case"error":return T({},e,{data:void 0,error:t.error,failureCount:e.failureCount+1,isPaused:!1,status:"error"});case"setState":return T({},e,t.state);default:return e}}var td=function(e){kn(t,e);function t(r){var i;return i=e.call(this)||this,i.config=r||{},i.mutations=[],i.mutationId=0,i}var n=t.prototype;return n.build=function(i,o,l){var u=new Zf({mutationCache:this,mutationId:++this.mutationId,options:i.defaultMutationOptions(o),state:l,defaultOptions:o.mutationKey?i.getMutationDefaults(o.mutationKey):void 0,meta:o.meta});return this.add(u),u},n.add=function(i){this.mutations.push(i),this.notify(i)},n.remove=function(i){this.mutations=this.mutations.filter(function(o){return o!==i}),i.cancel(),this.notify(i)},n.clear=function(){var i=this;H.batch(function(){i.mutations.forEach(function(o){i.remove(o)})})},n.getAll=function(){return this.mutations},n.find=function(i){return typeof i.exact>"u"&&(i.exact=!0),this.mutations.find(function(o){return ju(i,o)})},n.findAll=function(i){return this.mutations.filter(function(o){return ju(i,o)})},n.notify=function(i){var o=this;H.batch(function(){o.listeners.forEach(function(l){l(i)})})},n.onFocus=function(){this.resumePausedMutations()},n.onOnline=function(){this.resumePausedMutations()},n.resumePausedMutations=function(){var i=this.mutations.filter(function(o){return o.state.isPaused});return H.batch(function(){return i.reduce(function(o,l){return o.then(function(){return l.continue().catch(le)})},Promise.resolve())})},t}(En);function nd(){return{onFetch:function(t){t.fetchFn=function(){var n,r,i,o,l,u,s=(n=t.fetchOptions)==null||(r=n.meta)==null?void 0:r.refetchPage,a=(i=t.fetchOptions)==null||(o=i.meta)==null?void 0:o.fetchMore,m=a==null?void 0:a.pageParam,h=(a==null?void 0:a.direction)==="forward",p=(a==null?void 0:a.direction)==="backward",v=((l=t.state.data)==null?void 0:l.pages)||[],y=((u=t.state.data)==null?void 0:u.pageParams)||[],_=Uu(),O=_==null?void 0:_.signal,d=y,c=!1,f=t.options.queryFn||function(){return Promise.reject("Missing queryFn")},x=function(Ve,Nt,we,ot){return d=ot?[Nt].concat(d):[].concat(d,[Nt]),ot?[we].concat(Ve):[].concat(Ve,[we])},C=function(Ve,Nt,we,ot){if(c)return Promise.reject("Cancelled");if(typeof we>"u"&&!Nt&&Ve.length)return Promise.resolve(Ve);var k={queryKey:t.queryKey,signal:O,pageParam:we,meta:t.meta},N=f(k),D=Promise.resolve(N).then(function(Y){return x(Ve,we,Y,ot)});if(Nr(N)){var Q=D;Q.cancel=N.cancel}return D},S;if(!v.length)S=C([]);else if(h){var M=typeof m<"u",P=M?m:Vu(t.options,v);S=C(v,M,P)}else if(p){var z=typeof m<"u",I=z?m:rd(t.options,v);S=C(v,z,I,!0)}else(function(){d=[];var Ie=typeof t.options.getNextPageParam>"u",Ve=s&&v[0]?s(v[0],0,v):!0;S=Ve?C([],Ie,y[0]):Promise.resolve(x([],y[0],v[0]));for(var Nt=function(k){S=S.then(function(N){var D=s&&v[k]?s(v[k],k,v):!0;if(D){var Q=Ie?y[k]:Vu(t.options,N);return C(N,Ie,Q)}return Promise.resolve(x(N,y[k],v[k]))})},we=1;we<v.length;we++)Nt(we)})();var fe=S.then(function(Ie){return{pages:Ie,pageParams:d}}),Ne=fe;return Ne.cancel=function(){c=!0,_==null||_.abort(),Nr(S)&&S.cancel()},fe}}}}function Vu(e,t){return e.getNextPageParam==null?void 0:e.getNextPageParam(t[t.length-1],t)}function rd(e,t){return e.getPreviousPageParam==null?void 0:e.getPreviousPageParam(t[0],t)}var id=function(){function e(n){n===void 0&&(n={}),this.queryCache=n.queryCache||new Xf,this.mutationCache=n.mutationCache||new td,this.defaultOptions=n.defaultOptions||{},this.queryDefaults=[],this.mutationDefaults=[]}var t=e.prototype;return t.mount=function(){var r=this;this.unsubscribeFocus=Mn.subscribe(function(){Mn.isFocused()&&Pr.isOnline()&&(r.mutationCache.onFocus(),r.queryCache.onFocus())}),this.unsubscribeOnline=Pr.subscribe(function(){Mn.isFocused()&&Pr.isOnline()&&(r.mutationCache.onOnline(),r.queryCache.onOnline())})},t.unmount=function(){var r,i;(r=this.unsubscribeFocus)==null||r.call(this),(i=this.unsubscribeOnline)==null||i.call(this)},t.isFetching=function(r,i){var o=lt(r,i),l=o[0];return l.fetching=!0,this.queryCache.findAll(l).length},t.isMutating=function(r){return this.mutationCache.findAll(T({},r,{fetching:!0})).length},t.getQueryData=function(r,i){var o;return(o=this.queryCache.find(r,i))==null?void 0:o.state.data},t.getQueriesData=function(r){return this.getQueryCache().findAll(r).map(function(i){var o=i.queryKey,l=i.state,u=l.data;return[o,u]})},t.setQueryData=function(r,i,o){var l=Cr(r),u=this.defaultQueryOptions(l);return this.queryCache.build(this,u).setData(i,o)},t.setQueriesData=function(r,i,o){var l=this;return H.batch(function(){return l.getQueryCache().findAll(r).map(function(u){var s=u.queryKey;return[s,l.setQueryData(s,i,o)]})})},t.getQueryState=function(r,i){var o;return(o=this.queryCache.find(r,i))==null?void 0:o.state},t.removeQueries=function(r,i){var o=lt(r,i),l=o[0],u=this.queryCache;H.batch(function(){u.findAll(l).forEach(function(s){u.remove(s)})})},t.resetQueries=function(r,i,o){var l=this,u=lt(r,i,o),s=u[0],a=u[1],m=this.queryCache,h=T({},s,{active:!0});return H.batch(function(){return m.findAll(s).forEach(function(p){p.reset()}),l.refetchQueries(h,a)})},t.cancelQueries=function(r,i,o){var l=this,u=lt(r,i,o),s=u[0],a=u[1],m=a===void 0?{}:a;typeof m.revert>"u"&&(m.revert=!0);var h=H.batch(function(){return l.queryCache.findAll(s).map(function(p){return p.cancel(m)})});return Promise.all(h).then(le).catch(le)},t.invalidateQueries=function(r,i,o){var l,u,s,a=this,m=lt(r,i,o),h=m[0],p=m[1],v=T({},h,{active:(l=(u=h.refetchActive)!=null?u:h.active)!=null?l:!0,inactive:(s=h.refetchInactive)!=null?s:!1});return H.batch(function(){return a.queryCache.findAll(h).forEach(function(y){y.invalidate()}),a.refetchQueries(v,p)})},t.refetchQueries=function(r,i,o){var l=this,u=lt(r,i,o),s=u[0],a=u[1],m=H.batch(function(){return l.queryCache.findAll(s).map(function(p){return p.fetch(void 0,T({},a,{meta:{refetchPage:s==null?void 0:s.refetchPage}}))})}),h=Promise.all(m).then(le);return a!=null&&a.throwOnError||(h=h.catch(le)),h},t.fetchQuery=function(r,i,o){var l=Cr(r,i,o),u=this.defaultQueryOptions(l);typeof u.retry>"u"&&(u.retry=!1);var s=this.queryCache.build(this,u);return s.isStaleByTime(u.staleTime)?s.fetch(u):Promise.resolve(s.state.data)},t.prefetchQuery=function(r,i,o){return this.fetchQuery(r,i,o).then(le).catch(le)},t.fetchInfiniteQuery=function(r,i,o){var l=Cr(r,i,o);return l.behavior=nd(),this.fetchQuery(l)},t.prefetchInfiniteQuery=function(r,i,o){return this.fetchInfiniteQuery(r,i,o).then(le).catch(le)},t.cancelMutations=function(){var r=this,i=H.batch(function(){return r.mutationCache.getAll().map(function(o){return o.cancel()})});return Promise.all(i).then(le).catch(le)},t.resumePausedMutations=function(){return this.getMutationCache().resumePausedMutations()},t.executeMutation=function(r){return this.mutationCache.build(this,r).execute()},t.getQueryCache=function(){return this.queryCache},t.getMutationCache=function(){return this.mutationCache},t.getDefaultOptions=function(){return this.defaultOptions},t.setDefaultOptions=function(r){this.defaultOptions=r},t.setQueryDefaults=function(r,i){var o=this.queryDefaults.find(function(l){return It(r)===It(l.queryKey)});o?o.defaultOptions=i:this.queryDefaults.push({queryKey:r,defaultOptions:i})},t.getQueryDefaults=function(r){var i;return r?(i=this.queryDefaults.find(function(o){return kr(r,o.queryKey)}))==null?void 0:i.defaultOptions:void 0},t.setMutationDefaults=function(r,i){var o=this.mutationDefaults.find(function(l){return It(r)===It(l.mutationKey)});o?o.defaultOptions=i:this.mutationDefaults.push({mutationKey:r,defaultOptions:i})},t.getMutationDefaults=function(r){var i;return r?(i=this.mutationDefaults.find(function(o){return kr(r,o.mutationKey)}))==null?void 0:i.defaultOptions:void 0},t.defaultQueryOptions=function(r){if(r!=null&&r._defaulted)return r;var i=T({},this.defaultOptions.queries,this.getQueryDefaults(r==null?void 0:r.queryKey),r,{_defaulted:!0});return!i.queryHash&&i.queryKey&&(i.queryHash=Ji(i.queryKey,i)),i},t.defaultQueryObserverOptions=function(r){return this.defaultQueryOptions(r)},t.defaultMutationOptions=function(r){return r!=null&&r._defaulted?r:T({},this.defaultOptions.mutations,this.getMutationDefaults(r==null?void 0:r.mutationKey),r,{_defaulted:!0})},t.clear=function(){this.queryCache.clear(),this.mutationCache.clear()},e}(),od=function(e){kn(t,e);function t(r,i){var o;return o=e.call(this)||this,o.client=r,o.options=i,o.trackedProps=[],o.selectError=null,o.bindMethods(),o.setOptions(i),o}var n=t.prototype;return n.bindMethods=function(){this.remove=this.remove.bind(this),this.refetch=this.refetch.bind(this)},n.onSubscribe=function(){this.listeners.length===1&&(this.currentQuery.addObserver(this),Wu(this.currentQuery,this.options)&&this.executeFetch(),this.updateTimers())},n.onUnsubscribe=function(){this.listeners.length||this.destroy()},n.shouldFetchOnReconnect=function(){return to(this.currentQuery,this.options,this.options.refetchOnReconnect)},n.shouldFetchOnWindowFocus=function(){return to(this.currentQuery,this.options,this.options.refetchOnWindowFocus)},n.destroy=function(){this.listeners=[],this.clearTimers(),this.currentQuery.removeObserver(this)},n.setOptions=function(i,o){var l=this.options,u=this.currentQuery;if(this.options=this.client.defaultQueryObserverOptions(i),typeof this.options.enabled<"u"&&typeof this.options.enabled!="boolean")throw new Error("Expected enabled to be a boolean");this.options.queryKey||(this.options.queryKey=l.queryKey),this.updateQuery();var s=this.hasListeners();s&&Hu(this.currentQuery,u,this.options,l)&&this.executeFetch(),this.updateResult(o),s&&(this.currentQuery!==u||this.options.enabled!==l.enabled||this.options.staleTime!==l.staleTime)&&this.updateStaleTimeout();var a=this.computeRefetchInterval();s&&(this.currentQuery!==u||this.options.enabled!==l.enabled||a!==this.currentRefetchInterval)&&this.updateRefetchInterval(a)},n.getOptimisticResult=function(i){var o=this.client.defaultQueryObserverOptions(i),l=this.client.getQueryCache().build(this.client,o);return this.createResult(l,o)},n.getCurrentResult=function(){return this.currentResult},n.trackResult=function(i,o){var l=this,u={},s=function(m){l.trackedProps.includes(m)||l.trackedProps.push(m)};return Object.keys(i).forEach(function(a){Object.defineProperty(u,a,{configurable:!1,enumerable:!0,get:function(){return s(a),i[a]}})}),(o.useErrorBoundary||o.suspense)&&s("error"),u},n.getNextResult=function(i){var o=this;return new Promise(function(l,u){var s=o.subscribe(function(a){a.isFetching||(s(),a.isError&&(i!=null&&i.throwOnError)?u(a.error):l(a))})})},n.getCurrentQuery=function(){return this.currentQuery},n.remove=function(){this.client.getQueryCache().remove(this.currentQuery)},n.refetch=function(i){return this.fetch(T({},i,{meta:{refetchPage:i==null?void 0:i.refetchPage}}))},n.fetchOptimistic=function(i){var o=this,l=this.client.defaultQueryObserverOptions(i),u=this.client.getQueryCache().build(this.client,l);return u.fetch().then(function(){return o.createResult(u,l)})},n.fetch=function(i){var o=this;return this.executeFetch(i).then(function(){return o.updateResult(),o.currentResult})},n.executeFetch=function(i){this.updateQuery();var o=this.currentQuery.fetch(this.options,i);return i!=null&&i.throwOnError||(o=o.catch(le)),o},n.updateStaleTimeout=function(){var i=this;if(this.clearStaleTimeout(),!(wr||this.currentResult.isStale||!Zi(this.options.staleTime))){var o=Lu(this.currentResult.dataUpdatedAt,this.options.staleTime),l=o+1;this.staleTimeoutId=setTimeout(function(){i.currentResult.isStale||i.updateResult()},l)}},n.computeRefetchInterval=function(){var i;return typeof this.options.refetchInterval=="function"?this.options.refetchInterval(this.currentResult.data,this.currentQuery):(i=this.options.refetchInterval)!=null?i:!1},n.updateRefetchInterval=function(i){var o=this;this.clearRefetchInterval(),this.currentRefetchInterval=i,!(wr||this.options.enabled===!1||!Zi(this.currentRefetchInterval)||this.currentRefetchInterval===0)&&(this.refetchIntervalId=setInterval(function(){(o.options.refetchIntervalInBackground||Mn.isFocused())&&o.executeFetch()},this.currentRefetchInterval))},n.updateTimers=function(){this.updateStaleTimeout(),this.updateRefetchInterval(this.computeRefetchInterval())},n.clearTimers=function(){this.clearStaleTimeout(),this.clearRefetchInterval()},n.clearStaleTimeout=function(){this.staleTimeoutId&&(clearTimeout(this.staleTimeoutId),this.staleTimeoutId=void 0)},n.clearRefetchInterval=function(){this.refetchIntervalId&&(clearInterval(this.refetchIntervalId),this.refetchIntervalId=void 0)},n.createResult=function(i,o){var l=this.currentQuery,u=this.options,s=this.currentResult,a=this.currentResultState,m=this.currentResultOptions,h=i!==l,p=h?i.state:this.currentQueryInitialState,v=h?this.currentResult:this.previousQueryResult,y=i.state,_=y.dataUpdatedAt,O=y.error,d=y.errorUpdatedAt,c=y.isFetching,f=y.status,x=!1,C=!1,S;if(o.optimisticResults){var M=this.hasListeners(),P=!M&&Wu(i,o),z=M&&Hu(i,l,o,u);(P||z)&&(c=!0,_||(f="loading"))}if(o.keepPreviousData&&!y.dataUpdateCount&&(v!=null&&v.isSuccess)&&f!=="error")S=v.data,_=v.dataUpdatedAt,f=v.status,x=!0;else if(o.select&&typeof y.data<"u")if(s&&y.data===(a==null?void 0:a.data)&&o.select===this.selectFn)S=this.selectResult;else try{this.selectFn=o.select,S=o.select(y.data),o.structuralSharing!==!1&&(S=Er(s==null?void 0:s.data,S)),this.selectResult=S,this.selectError=null}catch(Ne){Or().error(Ne),this.selectError=Ne}else S=y.data;if(typeof o.placeholderData<"u"&&typeof S>"u"&&(f==="loading"||f==="idle")){var I;if(s!=null&&s.isPlaceholderData&&o.placeholderData===(m==null?void 0:m.placeholderData))I=s.data;else if(I=typeof o.placeholderData=="function"?o.placeholderData():o.placeholderData,o.select&&typeof I<"u")try{I=o.select(I),o.structuralSharing!==!1&&(I=Er(s==null?void 0:s.data,I)),this.selectError=null}catch(Ne){Or().error(Ne),this.selectError=Ne}typeof I<"u"&&(f="success",S=I,C=!0)}this.selectError&&(O=this.selectError,S=this.selectResult,d=Date.now(),f="error");var fe={status:f,isLoading:f==="loading",isSuccess:f==="success",isError:f==="error",isIdle:f==="idle",data:S,dataUpdatedAt:_,error:O,errorUpdatedAt:d,failureCount:y.fetchFailureCount,errorUpdateCount:y.errorUpdateCount,isFetched:y.dataUpdateCount>0||y.errorUpdateCount>0,isFetchedAfterMount:y.dataUpdateCount>p.dataUpdateCount||y.errorUpdateCount>p.errorUpdateCount,isFetching:c,isRefetching:c&&f!=="loading",isLoadingError:f==="error"&&y.dataUpdatedAt===0,isPlaceholderData:C,isPreviousData:x,isRefetchError:f==="error"&&y.dataUpdatedAt!==0,isStale:no(i,o),refetch:this.refetch,remove:this.remove};return fe},n.shouldNotifyListeners=function(i,o){if(!o)return!0;var l=this.options,u=l.notifyOnChangeProps,s=l.notifyOnChangePropsExclusions;if(!u&&!s||u==="tracked"&&!this.trackedProps.length)return!0;var a=u==="tracked"?this.trackedProps:u;return Object.keys(i).some(function(m){var h=m,p=i[h]!==o[h],v=a==null?void 0:a.some(function(_){return _===m}),y=s==null?void 0:s.some(function(_){return _===m});return p&&!y&&(!a||v)})},n.updateResult=function(i){var o=this.currentResult;if(this.currentResult=this.createResult(this.currentQuery,this.options),this.currentResultState=this.currentQuery.state,this.currentResultOptions=this.options,!Vf(this.currentResult,o)){var l={cache:!0};(i==null?void 0:i.listeners)!==!1&&this.shouldNotifyListeners(this.currentResult,o)&&(l.listeners=!0),this.notify(T({},l,i))}},n.updateQuery=function(){var i=this.client.getQueryCache().build(this.client,this.options);if(i!==this.currentQuery){var o=this.currentQuery;this.currentQuery=i,this.currentQueryInitialState=i.state,this.previousQueryResult=this.currentResult,this.hasListeners()&&(o==null||o.removeObserver(this),i.addObserver(this))}},n.onQueryUpdate=function(i){var o={};i.type==="success"?o.onSuccess=!0:i.type==="error"&&!Ir(i.error)&&(o.onError=!0),this.updateResult(o),this.hasListeners()&&this.updateTimers()},n.notify=function(i){var o=this;H.batch(function(){i.onSuccess?(o.options.onSuccess==null||o.options.onSuccess(o.currentResult.data),o.options.onSettled==null||o.options.onSettled(o.currentResult.data,null)):i.onError&&(o.options.onError==null||o.options.onError(o.currentResult.error),o.options.onSettled==null||o.options.onSettled(void 0,o.currentResult.error)),i.listeners&&o.listeners.forEach(function(l){l(o.currentResult)}),i.cache&&o.client.getQueryCache().notify({query:o.currentQuery,type:"observerResultsUpdated"})})},t}(En);function ld(e,t){return t.enabled!==!1&&!e.state.dataUpdatedAt&&!(e.state.status==="error"&&t.retryOnMount===!1)}function Wu(e,t){return ld(e,t)||e.state.dataUpdatedAt>0&&to(e,t,t.refetchOnMount)}function to(e,t,n){if(t.enabled!==!1){var r=typeof n=="function"?n(e):n;return r==="always"||r!==!1&&no(e,t)}return!1}function Hu(e,t,n,r){return n.enabled!==!1&&(e!==t||r.enabled===!1)&&(!n.suspense||e.state.status!=="error")&&no(e,n)}function no(e,t){return e.isStaleByTime(t.staleTime)}var Ku={exports:{}},Se={},qu={exports:{}},bu={};/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */(function(e){function t(k,N){var D=k.length;k.push(N);e:for(;0<D;){var Q=D-1>>>1,Y=k[Q];if(0<i(Y,N))k[Q]=N,k[D]=Y,D=Q;else break e}}function n(k){return k.length===0?null:k[0]}function r(k){if(k.length===0)return null;var N=k[0],D=k.pop();if(D!==N){k[0]=D;e:for(var Q=0,Y=k.length,Wi=Y>>>1;Q<Wi;){var Ht=2*(Q+1)-1,yu=k[Ht],Kt=Ht+1,Hi=k[Kt];if(0>i(yu,D))Kt<Y&&0>i(Hi,yu)?(k[Q]=Hi,k[Kt]=D,Q=Kt):(k[Q]=yu,k[Ht]=D,Q=Ht);else if(Kt<Y&&0>i(Hi,D))k[Q]=Hi,k[Kt]=D,Q=Kt;else break e}}return N}function i(k,N){var D=k.sortIndex-N.sortIndex;return D!==0?D:k.id-N.id}if(typeof performance=="object"&&typeof performance.now=="function"){var o=performance;e.unstable_now=function(){return o.now()}}else{var l=Date,u=l.now();e.unstable_now=function(){return l.now()-u}}var s=[],a=[],m=1,h=null,p=3,v=!1,y=!1,_=!1,O=typeof setTimeout=="function"?setTimeout:null,d=typeof clearTimeout=="function"?clearTimeout:null,c=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function f(k){for(var N=n(a);N!==null;){if(N.callback===null)r(a);else if(N.startTime<=k)r(a),N.sortIndex=N.expirationTime,t(s,N);else break;N=n(a)}}function x(k){if(_=!1,f(k),!y)if(n(s)!==null)y=!0,we(C);else{var N=n(a);N!==null&&ot(x,N.startTime-k)}}function C(k,N){y=!1,_&&(_=!1,d(P),P=-1),v=!0;var D=p;try{for(f(N),h=n(s);h!==null&&(!(h.expirationTime>N)||k&&!fe());){var Q=h.callback;if(typeof Q=="function"){h.callback=null,p=h.priorityLevel;var Y=Q(h.expirationTime<=N);N=e.unstable_now(),typeof Y=="function"?h.callback=Y:h===n(s)&&r(s),f(N)}else r(s);h=n(s)}if(h!==null)var Wi=!0;else{var Ht=n(a);Ht!==null&&ot(x,Ht.startTime-N),Wi=!1}return Wi}finally{h=null,p=D,v=!1}}var S=!1,M=null,P=-1,z=5,I=-1;function fe(){return!(e.unstable_now()-I<z)}function Ne(){if(M!==null){var k=e.unstable_now();I=k;var N=!0;try{N=M(!0,k)}finally{N?Ie():(S=!1,M=null)}}else S=!1}var Ie;if(typeof c=="function")Ie=function(){c(Ne)};else if(typeof MessageChannel<"u"){var Ve=new MessageChannel,Nt=Ve.port2;Ve.port1.onmessage=Ne,Ie=function(){Nt.postMessage(null)}}else Ie=function(){O(Ne,0)};function we(k){M=k,S||(S=!0,Ie())}function ot(k,N){P=O(function(){k(e.unstable_now())},N)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(k){k.callback=null},e.unstable_continueExecution=function(){y||v||(y=!0,we(C))},e.unstable_forceFrameRate=function(k){0>k||125<k?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):z=0<k?Math.floor(1e3/k):5},e.unstable_getCurrentPriorityLevel=function(){return p},e.unstable_getFirstCallbackNode=function(){return n(s)},e.unstable_next=function(k){switch(p){case 1:case 2:case 3:var N=3;break;default:N=p}var D=p;p=N;try{return k()}finally{p=D}},e.unstable_pauseExecution=function(){},e.unstable_requestPaint=function(){},e.unstable_runWithPriority=function(k,N){switch(k){case 1:case 2:case 3:case 4:case 5:break;default:k=3}var D=p;p=k;try{return N()}finally{p=D}},e.unstable_scheduleCallback=function(k,N,D){var Q=e.unstable_now();switch(typeof D=="object"&&D!==null?(D=D.delay,D=typeof D=="number"&&0<D?Q+D:Q):D=Q,k){case 1:var Y=-1;break;case 2:Y=250;break;case 5:Y=1073741823;break;case 4:Y=1e4;break;default:Y=5e3}return Y=D+Y,k={id:m++,callback:N,priorityLevel:k,startTime:D,expirationTime:Y,sortIndex:-1},D>Q?(k.sortIndex=D,t(a,k),n(s)===null&&k===n(a)&&(_?(d(P),P=-1):_=!0,ot(x,D-Q))):(k.sortIndex=Y,t(s,k),y||v||(y=!0,we(C))),k},e.unstable_shouldYield=fe,e.unstable_wrapCallback=function(k){var N=p;return function(){var D=p;p=N;try{return k.apply(this,arguments)}finally{p=D}}}})(bu),qu.exports=bu;var ud=qu.exports;/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Gu=J,Ce=ud;function w(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,n=1;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var Yu=new Set,Pn={};function Ot(e,t){bt(e,t),bt(e+"Capture",t)}function bt(e,t){for(Pn[e]=t,e=0;e<t.length;e++)Yu.add(t[e])}var Ge=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),ro=Object.prototype.hasOwnProperty,sd=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,Xu={},Zu={};function ad(e){return ro.call(Zu,e)?!0:ro.call(Xu,e)?!1:sd.test(e)?Zu[e]=!0:(Xu[e]=!0,!1)}function cd(e,t,n,r){if(n!==null&&n.type===0)return!1;switch(typeof t){case"function":case"symbol":return!0;case"boolean":return r?!1:n!==null?!n.acceptsBooleans:(e=e.toLowerCase().slice(0,5),e!=="data-"&&e!=="aria-");default:return!1}}function fd(e,t,n,r){if(t===null||typeof t>"u"||cd(e,t,n,r))return!0;if(r)return!1;if(n!==null)switch(n.type){case 3:return!t;case 4:return t===!1;case 5:return isNaN(t);case 6:return isNaN(t)||1>t}return!1}function pe(e,t,n,r,i,o,l){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=r,this.attributeNamespace=i,this.mustUseProperty=n,this.propertyName=e,this.type=t,this.sanitizeURL=o,this.removeEmptyString=l}var ne={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){ne[e]=new pe(e,0,!1,e,null,!1,!1)}),[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];ne[t]=new pe(t,1,!1,e[1],null,!1,!1)}),["contentEditable","draggable","spellCheck","value"].forEach(function(e){ne[e]=new pe(e,2,!1,e.toLowerCase(),null,!1,!1)}),["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){ne[e]=new pe(e,2,!1,e,null,!1,!1)}),"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){ne[e]=new pe(e,3,!1,e.toLowerCase(),null,!1,!1)}),["checked","multiple","muted","selected"].forEach(function(e){ne[e]=new pe(e,3,!0,e,null,!1,!1)}),["capture","download"].forEach(function(e){ne[e]=new pe(e,4,!1,e,null,!1,!1)}),["cols","rows","size","span"].forEach(function(e){ne[e]=new pe(e,6,!1,e,null,!1,!1)}),["rowSpan","start"].forEach(function(e){ne[e]=new pe(e,5,!1,e.toLowerCase(),null,!1,!1)});var io=/[\-:]([a-z])/g;function oo(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(io,oo);ne[t]=new pe(t,1,!1,e,null,!1,!1)}),"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(io,oo);ne[t]=new pe(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)}),["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(io,oo);ne[t]=new pe(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)}),["tabIndex","crossOrigin"].forEach(function(e){ne[e]=new pe(e,1,!1,e.toLowerCase(),null,!1,!1)}),ne.xlinkHref=new pe("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1),["src","href","action","formAction"].forEach(function(e){ne[e]=new pe(e,1,!1,e.toLowerCase(),null,!0,!0)});function lo(e,t,n,r){var i=ne.hasOwnProperty(t)?ne[t]:null;(i!==null?i.type!==0:r||!(2<t.length)||t[0]!=="o"&&t[0]!=="O"||t[1]!=="n"&&t[1]!=="N")&&(fd(t,n,i,r)&&(n=null),r||i===null?ad(t)&&(n===null?e.removeAttribute(t):e.setAttribute(t,""+n)):i.mustUseProperty?e[i.propertyName]=n===null?i.type===3?!1:"":n:(t=i.attributeName,r=i.attributeNamespace,n===null?e.removeAttribute(t):(i=i.type,n=i===3||i===4&&n===!0?"":""+n,r?e.setAttributeNS(r,t,n):e.setAttribute(t,n))))}var Ye=Gu.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,Dr=Symbol.for("react.element"),Gt=Symbol.for("react.portal"),Yt=Symbol.for("react.fragment"),uo=Symbol.for("react.strict_mode"),so=Symbol.for("react.profiler"),Ju=Symbol.for("react.provider"),es=Symbol.for("react.context"),ao=Symbol.for("react.forward_ref"),co=Symbol.for("react.suspense"),fo=Symbol.for("react.suspense_list"),po=Symbol.for("react.memo"),ut=Symbol.for("react.lazy"),ts=Symbol.for("react.offscreen"),ns=Symbol.iterator;function Nn(e){return e===null||typeof e!="object"?null:(e=ns&&e[ns]||e["@@iterator"],typeof e=="function"?e:null)}var B=Object.assign,ho;function In(e){if(ho===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);ho=t&&t[1]||""}return`
`+ho+e}var mo=!1;function vo(e,t){if(!e||mo)return"";mo=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(t)if(t=function(){throw Error()},Object.defineProperty(t.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(t,[])}catch(a){var r=a}Reflect.construct(e,[],t)}else{try{t.call()}catch(a){r=a}e.call(t.prototype)}else{try{throw Error()}catch(a){r=a}e()}}catch(a){if(a&&r&&typeof a.stack=="string"){for(var i=a.stack.split(`
`),o=r.stack.split(`
`),l=i.length-1,u=o.length-1;1<=l&&0<=u&&i[l]!==o[u];)u--;for(;1<=l&&0<=u;l--,u--)if(i[l]!==o[u]){if(l!==1||u!==1)do if(l--,u--,0>u||i[l]!==o[u]){var s=`
`+i[l].replace(" at new "," at ");return e.displayName&&s.includes("<anonymous>")&&(s=s.replace("<anonymous>",e.displayName)),s}while(1<=l&&0<=u);break}}}finally{mo=!1,Error.prepareStackTrace=n}return(e=e?e.displayName||e.name:"")?In(e):""}function dd(e){switch(e.tag){case 5:return In(e.type);case 16:return In("Lazy");case 13:return In("Suspense");case 19:return In("SuspenseList");case 0:case 2:case 15:return e=vo(e.type,!1),e;case 11:return e=vo(e.type.render,!1),e;case 1:return e=vo(e.type,!0),e;default:return""}}function yo(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case Yt:return"Fragment";case Gt:return"Portal";case so:return"Profiler";case uo:return"StrictMode";case co:return"Suspense";case fo:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case es:return(e.displayName||"Context")+".Consumer";case Ju:return(e._context.displayName||"Context")+".Provider";case ao:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case po:return t=e.displayName||null,t!==null?t:yo(e.type)||"Memo";case ut:t=e._payload,e=e._init;try{return yo(e(t))}catch{}}return null}function pd(e){var t=e.type;switch(e.tag){case 24:return"Cache";case 9:return(t.displayName||"Context")+".Consumer";case 10:return(t._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return e=t.render,e=e.displayName||e.name||"",t.displayName||(e!==""?"ForwardRef("+e+")":"ForwardRef");case 7:return"Fragment";case 5:return t;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return yo(t);case 8:return t===uo?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof t=="function")return t.displayName||t.name||null;if(typeof t=="string")return t}return null}function st(e){switch(typeof e){case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function rs(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function hd(e){var t=rs(e)?"checked":"value",n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t),r=""+e[t];if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var i=n.get,o=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return i.call(this)},set:function(l){r=""+l,o.call(this,l)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return r},setValue:function(l){r=""+l},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Fr(e){e._valueTracker||(e._valueTracker=hd(e))}function is(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r="";return e&&(r=rs(e)?e.checked?"true":"false":e.value),e=r,e!==n?(t.setValue(e),!0):!1}function Lr(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function go(e,t){var n=t.checked;return B({},t,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:n??e._wrapperState.initialChecked})}function os(e,t){var n=t.defaultValue==null?"":t.defaultValue,r=t.checked!=null?t.checked:t.defaultChecked;n=st(t.value!=null?t.value:n),e._wrapperState={initialChecked:r,initialValue:n,controlled:t.type==="checkbox"||t.type==="radio"?t.checked!=null:t.value!=null}}function ls(e,t){t=t.checked,t!=null&&lo(e,"checked",t,!1)}function _o(e,t){ls(e,t);var n=st(t.value),r=t.type;if(n!=null)r==="number"?(n===0&&e.value===""||e.value!=n)&&(e.value=""+n):e.value!==""+n&&(e.value=""+n);else if(r==="submit"||r==="reset"){e.removeAttribute("value");return}t.hasOwnProperty("value")?xo(e,t.type,n):t.hasOwnProperty("defaultValue")&&xo(e,t.type,st(t.defaultValue)),t.checked==null&&t.defaultChecked!=null&&(e.defaultChecked=!!t.defaultChecked)}function us(e,t,n){if(t.hasOwnProperty("value")||t.hasOwnProperty("defaultValue")){var r=t.type;if(!(r!=="submit"&&r!=="reset"||t.value!==void 0&&t.value!==null))return;t=""+e._wrapperState.initialValue,n||t===e.value||(e.value=t),e.defaultValue=t}n=e.name,n!==""&&(e.name=""),e.defaultChecked=!!e._wrapperState.initialChecked,n!==""&&(e.name=n)}function xo(e,t,n){(t!=="number"||Lr(e.ownerDocument)!==e)&&(n==null?e.defaultValue=""+e._wrapperState.initialValue:e.defaultValue!==""+n&&(e.defaultValue=""+n))}var On=Array.isArray;function Xt(e,t,n,r){if(e=e.options,t){t={};for(var i=0;i<n.length;i++)t["$"+n[i]]=!0;for(n=0;n<e.length;n++)i=t.hasOwnProperty("$"+e[n].value),e[n].selected!==i&&(e[n].selected=i),i&&r&&(e[n].defaultSelected=!0)}else{for(n=""+st(n),t=null,i=0;i<e.length;i++){if(e[i].value===n){e[i].selected=!0,r&&(e[i].defaultSelected=!0);return}t!==null||e[i].disabled||(t=e[i])}t!==null&&(t.selected=!0)}}function wo(e,t){if(t.dangerouslySetInnerHTML!=null)throw Error(w(91));return B({},t,{value:void 0,defaultValue:void 0,children:""+e._wrapperState.initialValue})}function ss(e,t){var n=t.value;if(n==null){if(n=t.children,t=t.defaultValue,n!=null){if(t!=null)throw Error(w(92));if(On(n)){if(1<n.length)throw Error(w(93));n=n[0]}t=n}t==null&&(t=""),n=t}e._wrapperState={initialValue:st(n)}}function as(e,t){var n=st(t.value),r=st(t.defaultValue);n!=null&&(n=""+n,n!==e.value&&(e.value=n),t.defaultValue==null&&e.defaultValue!==n&&(e.defaultValue=n)),r!=null&&(e.defaultValue=""+r)}function cs(e){var t=e.textContent;t===e._wrapperState.initialValue&&t!==""&&t!==null&&(e.value=t)}function fs(e){switch(e){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function So(e,t){return e==null||e==="http://www.w3.org/1999/xhtml"?fs(t):e==="http://www.w3.org/2000/svg"&&t==="foreignObject"?"http://www.w3.org/1999/xhtml":e}var Tr,ds=function(e){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(t,n,r,i){MSApp.execUnsafeLocalFunction(function(){return e(t,n,r,i)})}:e}(function(e,t){if(e.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in e)e.innerHTML=t;else{for(Tr=Tr||document.createElement("div"),Tr.innerHTML="<svg>"+t.valueOf().toString()+"</svg>",t=Tr.firstChild;e.firstChild;)e.removeChild(e.firstChild);for(;t.firstChild;)e.appendChild(t.firstChild)}});function Dn(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var Fn={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},md=["Webkit","ms","Moz","O"];Object.keys(Fn).forEach(function(e){md.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),Fn[t]=Fn[e]})});function ps(e,t,n){return t==null||typeof t=="boolean"||t===""?"":n||typeof t!="number"||t===0||Fn.hasOwnProperty(e)&&Fn[e]?(""+t).trim():t+"px"}function hs(e,t){e=e.style;for(var n in t)if(t.hasOwnProperty(n)){var r=n.indexOf("--")===0,i=ps(n,t[n],r);n==="float"&&(n="cssFloat"),r?e.setProperty(n,i):e[n]=i}}var vd=B({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function Co(e,t){if(t){if(vd[e]&&(t.children!=null||t.dangerouslySetInnerHTML!=null))throw Error(w(137,e));if(t.dangerouslySetInnerHTML!=null){if(t.children!=null)throw Error(w(60));if(typeof t.dangerouslySetInnerHTML!="object"||!("__html"in t.dangerouslySetInnerHTML))throw Error(w(61))}if(t.style!=null&&typeof t.style!="object")throw Error(w(62))}}function ko(e,t){if(e.indexOf("-")===-1)return typeof t.is=="string";switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Eo=null;function Mo(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var Po=null,Zt=null,Jt=null;function ms(e){if(e=er(e)){if(typeof Po!="function")throw Error(w(280));var t=e.stateNode;t&&(t=ri(t),Po(e.stateNode,e.type,t))}}function vs(e){Zt?Jt?Jt.push(e):Jt=[e]:Zt=e}function ys(){if(Zt){var e=Zt,t=Jt;if(Jt=Zt=null,ms(e),t)for(e=0;e<t.length;e++)ms(t[e])}}function gs(e,t){return e(t)}function _s(){}var No=!1;function xs(e,t,n){if(No)return e(t,n);No=!0;try{return gs(e,t,n)}finally{No=!1,(Zt!==null||Jt!==null)&&(_s(),ys())}}function Ln(e,t){var n=e.stateNode;if(n===null)return null;var r=ri(n);if(r===null)return null;n=r[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(e=e.type,r=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!r;break e;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(w(231,t,typeof n));return n}var Io=!1;if(Ge)try{var Tn={};Object.defineProperty(Tn,"passive",{get:function(){Io=!0}}),window.addEventListener("test",Tn,Tn),window.removeEventListener("test",Tn,Tn)}catch{Io=!1}function yd(e,t,n,r,i,o,l,u,s){var a=Array.prototype.slice.call(arguments,3);try{t.apply(n,a)}catch(m){this.onError(m)}}var jn=!1,jr=null,Rr=!1,Oo=null,gd={onError:function(e){jn=!0,jr=e}};function _d(e,t,n,r,i,o,l,u,s){jn=!1,jr=null,yd.apply(gd,arguments)}function xd(e,t,n,r,i,o,l,u,s){if(_d.apply(this,arguments),jn){if(jn){var a=jr;jn=!1,jr=null}else throw Error(w(198));Rr||(Rr=!0,Oo=a)}}function Dt(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,t.flags&4098&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function ws(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function Ss(e){if(Dt(e)!==e)throw Error(w(188))}function wd(e){var t=e.alternate;if(!t){if(t=Dt(e),t===null)throw Error(w(188));return t!==e?null:e}for(var n=e,r=t;;){var i=n.return;if(i===null)break;var o=i.alternate;if(o===null){if(r=i.return,r!==null){n=r;continue}break}if(i.child===o.child){for(o=i.child;o;){if(o===n)return Ss(i),e;if(o===r)return Ss(i),t;o=o.sibling}throw Error(w(188))}if(n.return!==r.return)n=i,r=o;else{for(var l=!1,u=i.child;u;){if(u===n){l=!0,n=i,r=o;break}if(u===r){l=!0,r=i,n=o;break}u=u.sibling}if(!l){for(u=o.child;u;){if(u===n){l=!0,n=o,r=i;break}if(u===r){l=!0,r=o,n=i;break}u=u.sibling}if(!l)throw Error(w(189))}}if(n.alternate!==r)throw Error(w(190))}if(n.tag!==3)throw Error(w(188));return n.stateNode.current===n?e:t}function Cs(e){return e=wd(e),e!==null?ks(e):null}function ks(e){if(e.tag===5||e.tag===6)return e;for(e=e.child;e!==null;){var t=ks(e);if(t!==null)return t;e=e.sibling}return null}var Es=Ce.unstable_scheduleCallback,Ms=Ce.unstable_cancelCallback,Sd=Ce.unstable_shouldYield,Cd=Ce.unstable_requestPaint,b=Ce.unstable_now,kd=Ce.unstable_getCurrentPriorityLevel,Do=Ce.unstable_ImmediatePriority,Ps=Ce.unstable_UserBlockingPriority,zr=Ce.unstable_NormalPriority,Ed=Ce.unstable_LowPriority,Ns=Ce.unstable_IdlePriority,Ar=null,We=null;function Md(e){if(We&&typeof We.onCommitFiberRoot=="function")try{We.onCommitFiberRoot(Ar,e,void 0,(e.current.flags&128)===128)}catch{}}var Re=Math.clz32?Math.clz32:Id,Pd=Math.log,Nd=Math.LN2;function Id(e){return e>>>=0,e===0?32:31-(Pd(e)/Nd|0)|0}var Ur=64,Qr=4194304;function Rn(e){switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return e&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return e}}function $r(e,t){var n=e.pendingLanes;if(n===0)return 0;var r=0,i=e.suspendedLanes,o=e.pingedLanes,l=n&268435455;if(l!==0){var u=l&~i;u!==0?r=Rn(u):(o&=l,o!==0&&(r=Rn(o)))}else l=n&~i,l!==0?r=Rn(l):o!==0&&(r=Rn(o));if(r===0)return 0;if(t!==0&&t!==r&&!(t&i)&&(i=r&-r,o=t&-t,i>=o||i===16&&(o&4194240)!==0))return t;if(r&4&&(r|=n&16),t=e.entangledLanes,t!==0)for(e=e.entanglements,t&=r;0<t;)n=31-Re(t),i=1<<n,r|=e[n],t&=~i;return r}function Od(e,t){switch(e){case 1:case 2:case 4:return t+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function Dd(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,i=e.expirationTimes,o=e.pendingLanes;0<o;){var l=31-Re(o),u=1<<l,s=i[l];s===-1?(!(u&n)||u&r)&&(i[l]=Od(u,t)):s<=t&&(e.expiredLanes|=u),o&=~u}}function Fo(e){return e=e.pendingLanes&-1073741825,e!==0?e:e&1073741824?1073741824:0}function Is(){var e=Ur;return Ur<<=1,!(Ur&4194240)&&(Ur=64),e}function Lo(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function zn(e,t,n){e.pendingLanes|=t,t!==536870912&&(e.suspendedLanes=0,e.pingedLanes=0),e=e.eventTimes,t=31-Re(t),e[t]=n}function Fd(e,t){var n=e.pendingLanes&~t;e.pendingLanes=t,e.suspendedLanes=0,e.pingedLanes=0,e.expiredLanes&=t,e.mutableReadLanes&=t,e.entangledLanes&=t,t=e.entanglements;var r=e.eventTimes;for(e=e.expirationTimes;0<n;){var i=31-Re(n),o=1<<i;t[i]=0,r[i]=-1,e[i]=-1,n&=~o}}function To(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-Re(n),i=1<<r;i&t|e[r]&t&&(e[r]|=t),n&=~i}}var j=0;function Os(e){return e&=-e,1<e?4<e?e&268435455?16:536870912:4:1}var Ds,jo,Fs,Ls,Ts,Ro=!1,Br=[],at=null,ct=null,ft=null,An=new Map,Un=new Map,dt=[],Ld="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function js(e,t){switch(e){case"focusin":case"focusout":at=null;break;case"dragenter":case"dragleave":ct=null;break;case"mouseover":case"mouseout":ft=null;break;case"pointerover":case"pointerout":An.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":Un.delete(t.pointerId)}}function Qn(e,t,n,r,i,o){return e===null||e.nativeEvent!==o?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:o,targetContainers:[i]},t!==null&&(t=er(t),t!==null&&jo(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,i!==null&&t.indexOf(i)===-1&&t.push(i),e)}function Td(e,t,n,r,i){switch(t){case"focusin":return at=Qn(at,e,t,n,r,i),!0;case"dragenter":return ct=Qn(ct,e,t,n,r,i),!0;case"mouseover":return ft=Qn(ft,e,t,n,r,i),!0;case"pointerover":var o=i.pointerId;return An.set(o,Qn(An.get(o)||null,e,t,n,r,i)),!0;case"gotpointercapture":return o=i.pointerId,Un.set(o,Qn(Un.get(o)||null,e,t,n,r,i)),!0}return!1}function Rs(e){var t=Ft(e.target);if(t!==null){var n=Dt(t);if(n!==null){if(t=n.tag,t===13){if(t=ws(n),t!==null){e.blockedOn=t,Ts(e.priority,function(){Fs(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Vr(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=Ao(e.domEventName,e.eventSystemFlags,t[0],e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);Eo=r,n.target.dispatchEvent(r),Eo=null}else return t=er(n),t!==null&&jo(t),e.blockedOn=n,!1;t.shift()}return!0}function zs(e,t,n){Vr(e)&&n.delete(t)}function jd(){Ro=!1,at!==null&&Vr(at)&&(at=null),ct!==null&&Vr(ct)&&(ct=null),ft!==null&&Vr(ft)&&(ft=null),An.forEach(zs),Un.forEach(zs)}function $n(e,t){e.blockedOn===t&&(e.blockedOn=null,Ro||(Ro=!0,Ce.unstable_scheduleCallback(Ce.unstable_NormalPriority,jd)))}function Bn(e){function t(i){return $n(i,e)}if(0<Br.length){$n(Br[0],e);for(var n=1;n<Br.length;n++){var r=Br[n];r.blockedOn===e&&(r.blockedOn=null)}}for(at!==null&&$n(at,e),ct!==null&&$n(ct,e),ft!==null&&$n(ft,e),An.forEach(t),Un.forEach(t),n=0;n<dt.length;n++)r=dt[n],r.blockedOn===e&&(r.blockedOn=null);for(;0<dt.length&&(n=dt[0],n.blockedOn===null);)Rs(n),n.blockedOn===null&&dt.shift()}var en=Ye.ReactCurrentBatchConfig,Wr=!0;function Rd(e,t,n,r){var i=j,o=en.transition;en.transition=null;try{j=1,zo(e,t,n,r)}finally{j=i,en.transition=o}}function zd(e,t,n,r){var i=j,o=en.transition;en.transition=null;try{j=4,zo(e,t,n,r)}finally{j=i,en.transition=o}}function zo(e,t,n,r){if(Wr){var i=Ao(e,t,n,r);if(i===null)tl(e,t,r,Hr,n),js(e,r);else if(Td(i,e,t,n,r))r.stopPropagation();else if(js(e,r),t&4&&-1<Ld.indexOf(e)){for(;i!==null;){var o=er(i);if(o!==null&&Ds(o),o=Ao(e,t,n,r),o===null&&tl(e,t,r,Hr,n),o===i)break;i=o}i!==null&&r.stopPropagation()}else tl(e,t,r,null,n)}}var Hr=null;function Ao(e,t,n,r){if(Hr=null,e=Mo(r),e=Ft(e),e!==null)if(t=Dt(e),t===null)e=null;else if(n=t.tag,n===13){if(e=ws(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null);return Hr=e,null}function As(e){switch(e){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(kd()){case Do:return 1;case Ps:return 4;case zr:case Ed:return 16;case Ns:return 536870912;default:return 16}default:return 16}}var pt=null,Uo=null,Kr=null;function Us(){if(Kr)return Kr;var e,t=Uo,n=t.length,r,i="value"in pt?pt.value:pt.textContent,o=i.length;for(e=0;e<n&&t[e]===i[e];e++);var l=n-e;for(r=1;r<=l&&t[n-r]===i[o-r];r++);return Kr=i.slice(e,1<r?1-r:void 0)}function qr(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function br(){return!0}function Qs(){return!1}function ke(e){function t(n,r,i,o,l){this._reactName=n,this._targetInst=i,this.type=r,this.nativeEvent=o,this.target=l,this.currentTarget=null;for(var u in e)e.hasOwnProperty(u)&&(n=e[u],this[u]=n?n(o):o[u]);return this.isDefaultPrevented=(o.defaultPrevented!=null?o.defaultPrevented:o.returnValue===!1)?br:Qs,this.isPropagationStopped=Qs,this}return B(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=br)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=br)},persist:function(){},isPersistent:br}),t}var tn={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Qo=ke(tn),Vn=B({},tn,{view:0,detail:0}),Ad=ke(Vn),$o,Bo,Wn,Gr=B({},Vn,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Wo,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==Wn&&(Wn&&e.type==="mousemove"?($o=e.screenX-Wn.screenX,Bo=e.screenY-Wn.screenY):Bo=$o=0,Wn=e),$o)},movementY:function(e){return"movementY"in e?e.movementY:Bo}}),$s=ke(Gr),Ud=B({},Gr,{dataTransfer:0}),Qd=ke(Ud),$d=B({},Vn,{relatedTarget:0}),Vo=ke($d),Bd=B({},tn,{animationName:0,elapsedTime:0,pseudoElement:0}),Vd=ke(Bd),Wd=B({},tn,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),Hd=ke(Wd),Kd=B({},tn,{data:0}),Bs=ke(Kd),qd={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},bd={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Gd={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Yd(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Gd[e])?!!t[e]:!1}function Wo(){return Yd}var Xd=B({},Vn,{key:function(e){if(e.key){var t=qd[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=qr(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?bd[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Wo,charCode:function(e){return e.type==="keypress"?qr(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?qr(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),Zd=ke(Xd),Jd=B({},Gr,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),Vs=ke(Jd),ep=B({},Vn,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Wo}),tp=ke(ep),np=B({},tn,{propertyName:0,elapsedTime:0,pseudoElement:0}),rp=ke(np),ip=B({},Gr,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),op=ke(ip),lp=[9,13,27,32],Ho=Ge&&"CompositionEvent"in window,Hn=null;Ge&&"documentMode"in document&&(Hn=document.documentMode);var up=Ge&&"TextEvent"in window&&!Hn,Ws=Ge&&(!Ho||Hn&&8<Hn&&11>=Hn),Hs=" ",Ks=!1;function qs(e,t){switch(e){case"keyup":return lp.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function bs(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var nn=!1;function sp(e,t){switch(e){case"compositionend":return bs(t);case"keypress":return t.which!==32?null:(Ks=!0,Hs);case"textInput":return e=t.data,e===Hs&&Ks?null:e;default:return null}}function ap(e,t){if(nn)return e==="compositionend"||!Ho&&qs(e,t)?(e=Us(),Kr=Uo=pt=null,nn=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return Ws&&t.locale!=="ko"?null:t.data;default:return null}}var cp={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Gs(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!cp[e.type]:t==="textarea"}function Ys(e,t,n,r){vs(r),t=ei(t,"onChange"),0<t.length&&(n=new Qo("onChange","change",null,n,r),e.push({event:n,listeners:t}))}var Kn=null,qn=null;function fp(e){ha(e,0)}function Yr(e){var t=sn(e);if(is(t))return e}function dp(e,t){if(e==="change")return t}var Xs=!1;if(Ge){var Ko;if(Ge){var qo="oninput"in document;if(!qo){var Zs=document.createElement("div");Zs.setAttribute("oninput","return;"),qo=typeof Zs.oninput=="function"}Ko=qo}else Ko=!1;Xs=Ko&&(!document.documentMode||9<document.documentMode)}function Js(){Kn&&(Kn.detachEvent("onpropertychange",ea),qn=Kn=null)}function ea(e){if(e.propertyName==="value"&&Yr(qn)){var t=[];Ys(t,qn,e,Mo(e)),xs(fp,t)}}function pp(e,t,n){e==="focusin"?(Js(),Kn=t,qn=n,Kn.attachEvent("onpropertychange",ea)):e==="focusout"&&Js()}function hp(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Yr(qn)}function mp(e,t){if(e==="click")return Yr(t)}function vp(e,t){if(e==="input"||e==="change")return Yr(t)}function yp(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var ze=typeof Object.is=="function"?Object.is:yp;function bn(e,t){if(ze(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var i=n[r];if(!ro.call(t,i)||!ze(e[i],t[i]))return!1}return!0}function ta(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function na(e,t){var n=ta(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=ta(n)}}function ra(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?ra(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function ia(){for(var e=window,t=Lr();t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=Lr(e.document)}return t}function bo(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}function gp(e){var t=ia(),n=e.focusedElem,r=e.selectionRange;if(t!==n&&n&&n.ownerDocument&&ra(n.ownerDocument.documentElement,n)){if(r!==null&&bo(n)){if(t=r.start,e=r.end,e===void 0&&(e=t),"selectionStart"in n)n.selectionStart=t,n.selectionEnd=Math.min(e,n.value.length);else if(e=(t=n.ownerDocument||document)&&t.defaultView||window,e.getSelection){e=e.getSelection();var i=n.textContent.length,o=Math.min(r.start,i);r=r.end===void 0?o:Math.min(r.end,i),!e.extend&&o>r&&(i=r,r=o,o=i),i=na(n,o);var l=na(n,r);i&&l&&(e.rangeCount!==1||e.anchorNode!==i.node||e.anchorOffset!==i.offset||e.focusNode!==l.node||e.focusOffset!==l.offset)&&(t=t.createRange(),t.setStart(i.node,i.offset),e.removeAllRanges(),o>r?(e.addRange(t),e.extend(l.node,l.offset)):(t.setEnd(l.node,l.offset),e.addRange(t)))}}for(t=[],e=n;e=e.parentNode;)e.nodeType===1&&t.push({element:e,left:e.scrollLeft,top:e.scrollTop});for(typeof n.focus=="function"&&n.focus(),n=0;n<t.length;n++)e=t[n],e.element.scrollLeft=e.left,e.element.scrollTop=e.top}}var _p=Ge&&"documentMode"in document&&11>=document.documentMode,rn=null,Go=null,Gn=null,Yo=!1;function oa(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Yo||rn==null||rn!==Lr(r)||(r=rn,"selectionStart"in r&&bo(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),Gn&&bn(Gn,r)||(Gn=r,r=ei(Go,"onSelect"),0<r.length&&(t=new Qo("onSelect","select",null,t,n),e.push({event:t,listeners:r}),t.target=rn)))}function Xr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var on={animationend:Xr("Animation","AnimationEnd"),animationiteration:Xr("Animation","AnimationIteration"),animationstart:Xr("Animation","AnimationStart"),transitionend:Xr("Transition","TransitionEnd")},Xo={},la={};Ge&&(la=document.createElement("div").style,"AnimationEvent"in window||(delete on.animationend.animation,delete on.animationiteration.animation,delete on.animationstart.animation),"TransitionEvent"in window||delete on.transitionend.transition);function Zr(e){if(Xo[e])return Xo[e];if(!on[e])return e;var t=on[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in la)return Xo[e]=t[n];return e}var ua=Zr("animationend"),sa=Zr("animationiteration"),aa=Zr("animationstart"),ca=Zr("transitionend"),fa=new Map,da="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function ht(e,t){fa.set(e,t),Ot(t,[e])}for(var Zo=0;Zo<da.length;Zo++){var Jo=da[Zo],xp=Jo.toLowerCase(),wp=Jo[0].toUpperCase()+Jo.slice(1);ht(xp,"on"+wp)}ht(ua,"onAnimationEnd"),ht(sa,"onAnimationIteration"),ht(aa,"onAnimationStart"),ht("dblclick","onDoubleClick"),ht("focusin","onFocus"),ht("focusout","onBlur"),ht(ca,"onTransitionEnd"),bt("onMouseEnter",["mouseout","mouseover"]),bt("onMouseLeave",["mouseout","mouseover"]),bt("onPointerEnter",["pointerout","pointerover"]),bt("onPointerLeave",["pointerout","pointerover"]),Ot("onChange","change click focusin focusout input keydown keyup selectionchange".split(" ")),Ot("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")),Ot("onBeforeInput",["compositionend","keypress","textInput","paste"]),Ot("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" ")),Ot("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" ")),Ot("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var Yn="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),Sp=new Set("cancel close invalid load scroll toggle".split(" ").concat(Yn));function pa(e,t,n){var r=e.type||"unknown-event";e.currentTarget=n,xd(r,t,void 0,e),e.currentTarget=null}function ha(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var r=e[n],i=r.event;r=r.listeners;e:{var o=void 0;if(t)for(var l=r.length-1;0<=l;l--){var u=r[l],s=u.instance,a=u.currentTarget;if(u=u.listener,s!==o&&i.isPropagationStopped())break e;pa(i,u,a),o=s}else for(l=0;l<r.length;l++){if(u=r[l],s=u.instance,a=u.currentTarget,u=u.listener,s!==o&&i.isPropagationStopped())break e;pa(i,u,a),o=s}}}if(Rr)throw e=Oo,Rr=!1,Oo=null,e}function A(e,t){var n=t[ul];n===void 0&&(n=t[ul]=new Set);var r=e+"__bubble";n.has(r)||(ma(t,e,2,!1),n.add(r))}function el(e,t,n){var r=0;t&&(r|=4),ma(n,e,r,t)}var Jr="_reactListening"+Math.random().toString(36).slice(2);function Xn(e){if(!e[Jr]){e[Jr]=!0,Yu.forEach(function(n){n!=="selectionchange"&&(Sp.has(n)||el(n,!1,e),el(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Jr]||(t[Jr]=!0,el("selectionchange",!1,t))}}function ma(e,t,n,r){switch(As(t)){case 1:var i=Rd;break;case 4:i=zd;break;default:i=zo}n=i.bind(null,t,n,e),i=void 0,!Io||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(i=!0),r?i!==void 0?e.addEventListener(t,n,{capture:!0,passive:i}):e.addEventListener(t,n,!0):i!==void 0?e.addEventListener(t,n,{passive:i}):e.addEventListener(t,n,!1)}function tl(e,t,n,r,i){var o=r;if(!(t&1)&&!(t&2)&&r!==null)e:for(;;){if(r===null)return;var l=r.tag;if(l===3||l===4){var u=r.stateNode.containerInfo;if(u===i||u.nodeType===8&&u.parentNode===i)break;if(l===4)for(l=r.return;l!==null;){var s=l.tag;if((s===3||s===4)&&(s=l.stateNode.containerInfo,s===i||s.nodeType===8&&s.parentNode===i))return;l=l.return}for(;u!==null;){if(l=Ft(u),l===null)return;if(s=l.tag,s===5||s===6){r=o=l;continue e}u=u.parentNode}}r=r.return}xs(function(){var a=o,m=Mo(n),h=[];e:{var p=fa.get(e);if(p!==void 0){var v=Qo,y=e;switch(e){case"keypress":if(qr(n)===0)break e;case"keydown":case"keyup":v=Zd;break;case"focusin":y="focus",v=Vo;break;case"focusout":y="blur",v=Vo;break;case"beforeblur":case"afterblur":v=Vo;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":v=$s;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":v=Qd;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":v=tp;break;case ua:case sa:case aa:v=Vd;break;case ca:v=rp;break;case"scroll":v=Ad;break;case"wheel":v=op;break;case"copy":case"cut":case"paste":v=Hd;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":v=Vs}var _=(t&4)!==0,O=!_&&e==="scroll",d=_?p!==null?p+"Capture":null:p;_=[];for(var c=a,f;c!==null;){f=c;var x=f.stateNode;if(f.tag===5&&x!==null&&(f=x,d!==null&&(x=Ln(c,d),x!=null&&_.push(Zn(c,x,f)))),O)break;c=c.return}0<_.length&&(p=new v(p,y,null,n,m),h.push({event:p,listeners:_}))}}if(!(t&7)){e:{if(p=e==="mouseover"||e==="pointerover",v=e==="mouseout"||e==="pointerout",p&&n!==Eo&&(y=n.relatedTarget||n.fromElement)&&(Ft(y)||y[Xe]))break e;if((v||p)&&(p=m.window===m?m:(p=m.ownerDocument)?p.defaultView||p.parentWindow:window,v?(y=n.relatedTarget||n.toElement,v=a,y=y?Ft(y):null,y!==null&&(O=Dt(y),y!==O||y.tag!==5&&y.tag!==6)&&(y=null)):(v=null,y=a),v!==y)){if(_=$s,x="onMouseLeave",d="onMouseEnter",c="mouse",(e==="pointerout"||e==="pointerover")&&(_=Vs,x="onPointerLeave",d="onPointerEnter",c="pointer"),O=v==null?p:sn(v),f=y==null?p:sn(y),p=new _(x,c+"leave",v,n,m),p.target=O,p.relatedTarget=f,x=null,Ft(m)===a&&(_=new _(d,c+"enter",y,n,m),_.target=f,_.relatedTarget=O,x=_),O=x,v&&y)t:{for(_=v,d=y,c=0,f=_;f;f=ln(f))c++;for(f=0,x=d;x;x=ln(x))f++;for(;0<c-f;)_=ln(_),c--;for(;0<f-c;)d=ln(d),f--;for(;c--;){if(_===d||d!==null&&_===d.alternate)break t;_=ln(_),d=ln(d)}_=null}else _=null;v!==null&&va(h,p,v,_,!1),y!==null&&O!==null&&va(h,O,y,_,!0)}}e:{if(p=a?sn(a):window,v=p.nodeName&&p.nodeName.toLowerCase(),v==="select"||v==="input"&&p.type==="file")var C=dp;else if(Gs(p))if(Xs)C=vp;else{C=hp;var S=pp}else(v=p.nodeName)&&v.toLowerCase()==="input"&&(p.type==="checkbox"||p.type==="radio")&&(C=mp);if(C&&(C=C(e,a))){Ys(h,C,n,m);break e}S&&S(e,p,a),e==="focusout"&&(S=p._wrapperState)&&S.controlled&&p.type==="number"&&xo(p,"number",p.value)}switch(S=a?sn(a):window,e){case"focusin":(Gs(S)||S.contentEditable==="true")&&(rn=S,Go=a,Gn=null);break;case"focusout":Gn=Go=rn=null;break;case"mousedown":Yo=!0;break;case"contextmenu":case"mouseup":case"dragend":Yo=!1,oa(h,n,m);break;case"selectionchange":if(_p)break;case"keydown":case"keyup":oa(h,n,m)}var M;if(Ho)e:{switch(e){case"compositionstart":var P="onCompositionStart";break e;case"compositionend":P="onCompositionEnd";break e;case"compositionupdate":P="onCompositionUpdate";break e}P=void 0}else nn?qs(e,n)&&(P="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(P="onCompositionStart");P&&(Ws&&n.locale!=="ko"&&(nn||P!=="onCompositionStart"?P==="onCompositionEnd"&&nn&&(M=Us()):(pt=m,Uo="value"in pt?pt.value:pt.textContent,nn=!0)),S=ei(a,P),0<S.length&&(P=new Bs(P,e,null,n,m),h.push({event:P,listeners:S}),M?P.data=M:(M=bs(n),M!==null&&(P.data=M)))),(M=up?sp(e,n):ap(e,n))&&(a=ei(a,"onBeforeInput"),0<a.length&&(m=new Bs("onBeforeInput","beforeinput",null,n,m),h.push({event:m,listeners:a}),m.data=M))}ha(h,t)})}function Zn(e,t,n){return{instance:e,listener:t,currentTarget:n}}function ei(e,t){for(var n=t+"Capture",r=[];e!==null;){var i=e,o=i.stateNode;i.tag===5&&o!==null&&(i=o,o=Ln(e,n),o!=null&&r.unshift(Zn(e,o,i)),o=Ln(e,t),o!=null&&r.push(Zn(e,o,i))),e=e.return}return r}function ln(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5);return e||null}function va(e,t,n,r,i){for(var o=t._reactName,l=[];n!==null&&n!==r;){var u=n,s=u.alternate,a=u.stateNode;if(s!==null&&s===r)break;u.tag===5&&a!==null&&(u=a,i?(s=Ln(n,o),s!=null&&l.unshift(Zn(n,s,u))):i||(s=Ln(n,o),s!=null&&l.push(Zn(n,s,u)))),n=n.return}l.length!==0&&e.push({event:t,listeners:l})}var Cp=/\r\n?/g,kp=/\u0000|\uFFFD/g;function ya(e){return(typeof e=="string"?e:""+e).replace(Cp,`
`).replace(kp,"")}function ti(e,t,n){if(t=ya(t),ya(e)!==t&&n)throw Error(w(425))}function ni(){}var nl=null,rl=null;function il(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var ol=typeof setTimeout=="function"?setTimeout:void 0,Ep=typeof clearTimeout=="function"?clearTimeout:void 0,ga=typeof Promise=="function"?Promise:void 0,Mp=typeof queueMicrotask=="function"?queueMicrotask:typeof ga<"u"?function(e){return ga.resolve(null).then(e).catch(Pp)}:ol;function Pp(e){setTimeout(function(){throw e})}function ll(e,t){var n=t,r=0;do{var i=n.nextSibling;if(e.removeChild(n),i&&i.nodeType===8)if(n=i.data,n==="/$"){if(r===0){e.removeChild(i),Bn(t);return}r--}else n!=="$"&&n!=="$?"&&n!=="$!"||r++;n=i}while(n);Bn(t)}function mt(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?")break;if(t==="/$")return null}}return e}function _a(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"){if(t===0)return e;t--}else n==="/$"&&t++}e=e.previousSibling}return null}var un=Math.random().toString(36).slice(2),He="__reactFiber$"+un,Jn="__reactProps$"+un,Xe="__reactContainer$"+un,ul="__reactEvents$"+un,Np="__reactListeners$"+un,Ip="__reactHandles$"+un;function Ft(e){var t=e[He];if(t)return t;for(var n=e.parentNode;n;){if(t=n[Xe]||n[He]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=_a(e);e!==null;){if(n=e[He])return n;e=_a(e)}return t}e=n,n=e.parentNode}return null}function er(e){return e=e[He]||e[Xe],!e||e.tag!==5&&e.tag!==6&&e.tag!==13&&e.tag!==3?null:e}function sn(e){if(e.tag===5||e.tag===6)return e.stateNode;throw Error(w(33))}function ri(e){return e[Jn]||null}var sl=[],an=-1;function vt(e){return{current:e}}function U(e){0>an||(e.current=sl[an],sl[an]=null,an--)}function R(e,t){an++,sl[an]=e.current,e.current=t}var yt={},ue=vt(yt),ve=vt(!1),Lt=yt;function cn(e,t){var n=e.type.contextTypes;if(!n)return yt;var r=e.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===t)return r.__reactInternalMemoizedMaskedChildContext;var i={},o;for(o in n)i[o]=t[o];return r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=t,e.__reactInternalMemoizedMaskedChildContext=i),i}function ye(e){return e=e.childContextTypes,e!=null}function ii(){U(ve),U(ue)}function xa(e,t,n){if(ue.current!==yt)throw Error(w(168));R(ue,t),R(ve,n)}function wa(e,t,n){var r=e.stateNode;if(t=t.childContextTypes,typeof r.getChildContext!="function")return n;r=r.getChildContext();for(var i in r)if(!(i in t))throw Error(w(108,pd(e)||"Unknown",i));return B({},n,r)}function oi(e){return e=(e=e.stateNode)&&e.__reactInternalMemoizedMergedChildContext||yt,Lt=ue.current,R(ue,e),R(ve,ve.current),!0}function Sa(e,t,n){var r=e.stateNode;if(!r)throw Error(w(169));n?(e=wa(e,t,Lt),r.__reactInternalMemoizedMergedChildContext=e,U(ve),U(ue),R(ue,e)):U(ve),R(ve,n)}var Ze=null,li=!1,al=!1;function Ca(e){Ze===null?Ze=[e]:Ze.push(e)}function Op(e){li=!0,Ca(e)}function gt(){if(!al&&Ze!==null){al=!0;var e=0,t=j;try{var n=Ze;for(j=1;e<n.length;e++){var r=n[e];do r=r(!0);while(r!==null)}Ze=null,li=!1}catch(i){throw Ze!==null&&(Ze=Ze.slice(e+1)),Es(Do,gt),i}finally{j=t,al=!1}}return null}var fn=[],dn=0,ui=null,si=0,Oe=[],De=0,Tt=null,Je=1,et="";function jt(e,t){fn[dn++]=si,fn[dn++]=ui,ui=e,si=t}function ka(e,t,n){Oe[De++]=Je,Oe[De++]=et,Oe[De++]=Tt,Tt=e;var r=Je;e=et;var i=32-Re(r)-1;r&=~(1<<i),n+=1;var o=32-Re(t)+i;if(30<o){var l=i-i%5;o=(r&(1<<l)-1).toString(32),r>>=l,i-=l,Je=1<<32-Re(t)+i|n<<i|r,et=o+e}else Je=1<<o|n<<i|r,et=e}function cl(e){e.return!==null&&(jt(e,1),ka(e,1,0))}function fl(e){for(;e===ui;)ui=fn[--dn],fn[dn]=null,si=fn[--dn],fn[dn]=null;for(;e===Tt;)Tt=Oe[--De],Oe[De]=null,et=Oe[--De],Oe[De]=null,Je=Oe[--De],Oe[De]=null}var Ee=null,Me=null,$=!1,Ae=null;function Ea(e,t){var n=je(5,null,null,0);n.elementType="DELETED",n.stateNode=t,n.return=e,t=e.deletions,t===null?(e.deletions=[n],e.flags|=16):t.push(n)}function Ma(e,t){switch(e.tag){case 5:var n=e.type;return t=t.nodeType!==1||n.toLowerCase()!==t.nodeName.toLowerCase()?null:t,t!==null?(e.stateNode=t,Ee=e,Me=mt(t.firstChild),!0):!1;case 6:return t=e.pendingProps===""||t.nodeType!==3?null:t,t!==null?(e.stateNode=t,Ee=e,Me=null,!0):!1;case 13:return t=t.nodeType!==8?null:t,t!==null?(n=Tt!==null?{id:Je,overflow:et}:null,e.memoizedState={dehydrated:t,treeContext:n,retryLane:1073741824},n=je(18,null,null,0),n.stateNode=t,n.return=e,e.child=n,Ee=e,Me=null,!0):!1;default:return!1}}function dl(e){return(e.mode&1)!==0&&(e.flags&128)===0}function pl(e){if($){var t=Me;if(t){var n=t;if(!Ma(e,t)){if(dl(e))throw Error(w(418));t=mt(n.nextSibling);var r=Ee;t&&Ma(e,t)?Ea(r,n):(e.flags=e.flags&-4097|2,$=!1,Ee=e)}}else{if(dl(e))throw Error(w(418));e.flags=e.flags&-4097|2,$=!1,Ee=e}}}function Pa(e){for(e=e.return;e!==null&&e.tag!==5&&e.tag!==3&&e.tag!==13;)e=e.return;Ee=e}function ai(e){if(e!==Ee)return!1;if(!$)return Pa(e),$=!0,!1;var t;if((t=e.tag!==3)&&!(t=e.tag!==5)&&(t=e.type,t=t!=="head"&&t!=="body"&&!il(e.type,e.memoizedProps)),t&&(t=Me)){if(dl(e))throw Na(),Error(w(418));for(;t;)Ea(e,t),t=mt(t.nextSibling)}if(Pa(e),e.tag===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(w(317));e:{for(e=e.nextSibling,t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"){if(t===0){Me=mt(e.nextSibling);break e}t--}else n!=="$"&&n!=="$!"&&n!=="$?"||t++}e=e.nextSibling}Me=null}}else Me=Ee?mt(e.stateNode.nextSibling):null;return!0}function Na(){for(var e=Me;e;)e=mt(e.nextSibling)}function pn(){Me=Ee=null,$=!1}function hl(e){Ae===null?Ae=[e]:Ae.push(e)}var Dp=Ye.ReactCurrentBatchConfig;function Ue(e,t){if(e&&e.defaultProps){t=B({},t),e=e.defaultProps;for(var n in e)t[n]===void 0&&(t[n]=e[n]);return t}return t}var ci=vt(null),fi=null,hn=null,ml=null;function vl(){ml=hn=fi=null}function yl(e){var t=ci.current;U(ci),e._currentValue=t}function gl(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,r!==null&&(r.childLanes|=t)):r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t),e===n)break;e=e.return}}function mn(e,t){fi=e,ml=hn=null,e=e.dependencies,e!==null&&e.firstContext!==null&&(e.lanes&t&&(ge=!0),e.firstContext=null)}function Fe(e){var t=e._currentValue;if(ml!==e)if(e={context:e,memoizedValue:t,next:null},hn===null){if(fi===null)throw Error(w(308));hn=e,fi.dependencies={lanes:0,firstContext:e}}else hn=hn.next=e;return t}var Rt=null;function _l(e){Rt===null?Rt=[e]:Rt.push(e)}function Ia(e,t,n,r){var i=t.interleaved;return i===null?(n.next=n,_l(t)):(n.next=i.next,i.next=n),t.interleaved=n,tt(e,r)}function tt(e,t){e.lanes|=t;var n=e.alternate;for(n!==null&&(n.lanes|=t),n=e,e=e.return;e!==null;)e.childLanes|=t,n=e.alternate,n!==null&&(n.childLanes|=t),n=e,e=e.return;return n.tag===3?n.stateNode:null}var _t=!1;function xl(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function Oa(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,effects:e.effects})}function nt(e,t){return{eventTime:e,lane:t,tag:0,payload:null,callback:null,next:null}}function xt(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,L&2){var i=r.pending;return i===null?t.next=t:(t.next=i.next,i.next=t),r.pending=t,tt(e,n)}return i=r.interleaved,i===null?(t.next=t,_l(r)):(t.next=i.next,i.next=t),r.interleaved=t,tt(e,n)}function di(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194240)!==0)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,To(e,n)}}function Da(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var i=null,o=null;if(n=n.firstBaseUpdate,n!==null){do{var l={eventTime:n.eventTime,lane:n.lane,tag:n.tag,payload:n.payload,callback:n.callback,next:null};o===null?i=o=l:o=o.next=l,n=n.next}while(n!==null);o===null?i=o=t:o=o.next=t}else i=o=t;n={baseState:r.baseState,firstBaseUpdate:i,lastBaseUpdate:o,shared:r.shared,effects:r.effects},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}function pi(e,t,n,r){var i=e.updateQueue;_t=!1;var o=i.firstBaseUpdate,l=i.lastBaseUpdate,u=i.shared.pending;if(u!==null){i.shared.pending=null;var s=u,a=s.next;s.next=null,l===null?o=a:l.next=a,l=s;var m=e.alternate;m!==null&&(m=m.updateQueue,u=m.lastBaseUpdate,u!==l&&(u===null?m.firstBaseUpdate=a:u.next=a,m.lastBaseUpdate=s))}if(o!==null){var h=i.baseState;l=0,m=a=s=null,u=o;do{var p=u.lane,v=u.eventTime;if((r&p)===p){m!==null&&(m=m.next={eventTime:v,lane:0,tag:u.tag,payload:u.payload,callback:u.callback,next:null});e:{var y=e,_=u;switch(p=t,v=n,_.tag){case 1:if(y=_.payload,typeof y=="function"){h=y.call(v,h,p);break e}h=y;break e;case 3:y.flags=y.flags&-65537|128;case 0:if(y=_.payload,p=typeof y=="function"?y.call(v,h,p):y,p==null)break e;h=B({},h,p);break e;case 2:_t=!0}}u.callback!==null&&u.lane!==0&&(e.flags|=64,p=i.effects,p===null?i.effects=[u]:p.push(u))}else v={eventTime:v,lane:p,tag:u.tag,payload:u.payload,callback:u.callback,next:null},m===null?(a=m=v,s=h):m=m.next=v,l|=p;if(u=u.next,u===null){if(u=i.shared.pending,u===null)break;p=u,u=p.next,p.next=null,i.lastBaseUpdate=p,i.shared.pending=null}}while(!0);if(m===null&&(s=h),i.baseState=s,i.firstBaseUpdate=a,i.lastBaseUpdate=m,t=i.shared.interleaved,t!==null){i=t;do l|=i.lane,i=i.next;while(i!==t)}else o===null&&(i.shared.lanes=0);Ut|=l,e.lanes=l,e.memoizedState=h}}function Fa(e,t,n){if(e=t.effects,t.effects=null,e!==null)for(t=0;t<e.length;t++){var r=e[t],i=r.callback;if(i!==null){if(r.callback=null,r=n,typeof i!="function")throw Error(w(191,i));i.call(r)}}}var La=new Gu.Component().refs;function wl(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:B({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var hi={isMounted:function(e){return(e=e._reactInternals)?Dt(e)===e:!1},enqueueSetState:function(e,t,n){e=e._reactInternals;var r=me(),i=kt(e),o=nt(r,i);o.payload=t,n!=null&&(o.callback=n),t=xt(e,o,i),t!==null&&(Be(t,e,i,r),di(t,e,i))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=me(),i=kt(e),o=nt(r,i);o.tag=1,o.payload=t,n!=null&&(o.callback=n),t=xt(e,o,i),t!==null&&(Be(t,e,i,r),di(t,e,i))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=me(),r=kt(e),i=nt(n,r);i.tag=2,t!=null&&(i.callback=t),t=xt(e,i,r),t!==null&&(Be(t,e,r,n),di(t,e,r))}};function Ta(e,t,n,r,i,o,l){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(r,o,l):t.prototype&&t.prototype.isPureReactComponent?!bn(n,r)||!bn(i,o):!0}function ja(e,t,n){var r=!1,i=yt,o=t.contextType;return typeof o=="object"&&o!==null?o=Fe(o):(i=ye(t)?Lt:ue.current,r=t.contextTypes,o=(r=r!=null)?cn(e,i):yt),t=new t(n,o),e.memoizedState=t.state!==null&&t.state!==void 0?t.state:null,t.updater=hi,e.stateNode=t,t._reactInternals=e,r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=i,e.__reactInternalMemoizedMaskedChildContext=o),t}function Ra(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&hi.enqueueReplaceState(t,t.state,null)}function Sl(e,t,n,r){var i=e.stateNode;i.props=n,i.state=e.memoizedState,i.refs=La,xl(e);var o=t.contextType;typeof o=="object"&&o!==null?i.context=Fe(o):(o=ye(t)?Lt:ue.current,i.context=cn(e,o)),i.state=e.memoizedState,o=t.getDerivedStateFromProps,typeof o=="function"&&(wl(e,t,o,n),i.state=e.memoizedState),typeof t.getDerivedStateFromProps=="function"||typeof i.getSnapshotBeforeUpdate=="function"||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(t=i.state,typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount(),t!==i.state&&hi.enqueueReplaceState(i,i.state,null),pi(e,n,i,r),i.state=e.memoizedState),typeof i.componentDidMount=="function"&&(e.flags|=4194308)}function tr(e,t,n){if(e=n.ref,e!==null&&typeof e!="function"&&typeof e!="object"){if(n._owner){if(n=n._owner,n){if(n.tag!==1)throw Error(w(309));var r=n.stateNode}if(!r)throw Error(w(147,e));var i=r,o=""+e;return t!==null&&t.ref!==null&&typeof t.ref=="function"&&t.ref._stringRef===o?t.ref:(t=function(l){var u=i.refs;u===La&&(u=i.refs={}),l===null?delete u[o]:u[o]=l},t._stringRef=o,t)}if(typeof e!="string")throw Error(w(284));if(!n._owner)throw Error(w(290,e))}return e}function mi(e,t){throw e=Object.prototype.toString.call(t),Error(w(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e))}function za(e){var t=e._init;return t(e._payload)}function Aa(e){function t(d,c){if(e){var f=d.deletions;f===null?(d.deletions=[c],d.flags|=16):f.push(c)}}function n(d,c){if(!e)return null;for(;c!==null;)t(d,c),c=c.sibling;return null}function r(d,c){for(d=new Map;c!==null;)c.key!==null?d.set(c.key,c):d.set(c.index,c),c=c.sibling;return d}function i(d,c){return d=Mt(d,c),d.index=0,d.sibling=null,d}function o(d,c,f){return d.index=f,e?(f=d.alternate,f!==null?(f=f.index,f<c?(d.flags|=2,c):f):(d.flags|=2,c)):(d.flags|=1048576,c)}function l(d){return e&&d.alternate===null&&(d.flags|=2),d}function u(d,c,f,x){return c===null||c.tag!==6?(c=ou(f,d.mode,x),c.return=d,c):(c=i(c,f),c.return=d,c)}function s(d,c,f,x){var C=f.type;return C===Yt?m(d,c,f.props.children,x,f.key):c!==null&&(c.elementType===C||typeof C=="object"&&C!==null&&C.$$typeof===ut&&za(C)===c.type)?(x=i(c,f.props),x.ref=tr(d,c,f),x.return=d,x):(x=Ti(f.type,f.key,f.props,null,d.mode,x),x.ref=tr(d,c,f),x.return=d,x)}function a(d,c,f,x){return c===null||c.tag!==4||c.stateNode.containerInfo!==f.containerInfo||c.stateNode.implementation!==f.implementation?(c=lu(f,d.mode,x),c.return=d,c):(c=i(c,f.children||[]),c.return=d,c)}function m(d,c,f,x,C){return c===null||c.tag!==7?(c=Vt(f,d.mode,x,C),c.return=d,c):(c=i(c,f),c.return=d,c)}function h(d,c,f){if(typeof c=="string"&&c!==""||typeof c=="number")return c=ou(""+c,d.mode,f),c.return=d,c;if(typeof c=="object"&&c!==null){switch(c.$$typeof){case Dr:return f=Ti(c.type,c.key,c.props,null,d.mode,f),f.ref=tr(d,null,c),f.return=d,f;case Gt:return c=lu(c,d.mode,f),c.return=d,c;case ut:var x=c._init;return h(d,x(c._payload),f)}if(On(c)||Nn(c))return c=Vt(c,d.mode,f,null),c.return=d,c;mi(d,c)}return null}function p(d,c,f,x){var C=c!==null?c.key:null;if(typeof f=="string"&&f!==""||typeof f=="number")return C!==null?null:u(d,c,""+f,x);if(typeof f=="object"&&f!==null){switch(f.$$typeof){case Dr:return f.key===C?s(d,c,f,x):null;case Gt:return f.key===C?a(d,c,f,x):null;case ut:return C=f._init,p(d,c,C(f._payload),x)}if(On(f)||Nn(f))return C!==null?null:m(d,c,f,x,null);mi(d,f)}return null}function v(d,c,f,x,C){if(typeof x=="string"&&x!==""||typeof x=="number")return d=d.get(f)||null,u(c,d,""+x,C);if(typeof x=="object"&&x!==null){switch(x.$$typeof){case Dr:return d=d.get(x.key===null?f:x.key)||null,s(c,d,x,C);case Gt:return d=d.get(x.key===null?f:x.key)||null,a(c,d,x,C);case ut:var S=x._init;return v(d,c,f,S(x._payload),C)}if(On(x)||Nn(x))return d=d.get(f)||null,m(c,d,x,C,null);mi(c,x)}return null}function y(d,c,f,x){for(var C=null,S=null,M=c,P=c=0,z=null;M!==null&&P<f.length;P++){M.index>P?(z=M,M=null):z=M.sibling;var I=p(d,M,f[P],x);if(I===null){M===null&&(M=z);break}e&&M&&I.alternate===null&&t(d,M),c=o(I,c,P),S===null?C=I:S.sibling=I,S=I,M=z}if(P===f.length)return n(d,M),$&&jt(d,P),C;if(M===null){for(;P<f.length;P++)M=h(d,f[P],x),M!==null&&(c=o(M,c,P),S===null?C=M:S.sibling=M,S=M);return $&&jt(d,P),C}for(M=r(d,M);P<f.length;P++)z=v(M,d,P,f[P],x),z!==null&&(e&&z.alternate!==null&&M.delete(z.key===null?P:z.key),c=o(z,c,P),S===null?C=z:S.sibling=z,S=z);return e&&M.forEach(function(fe){return t(d,fe)}),$&&jt(d,P),C}function _(d,c,f,x){var C=Nn(f);if(typeof C!="function")throw Error(w(150));if(f=C.call(f),f==null)throw Error(w(151));for(var S=C=null,M=c,P=c=0,z=null,I=f.next();M!==null&&!I.done;P++,I=f.next()){M.index>P?(z=M,M=null):z=M.sibling;var fe=p(d,M,I.value,x);if(fe===null){M===null&&(M=z);break}e&&M&&fe.alternate===null&&t(d,M),c=o(fe,c,P),S===null?C=fe:S.sibling=fe,S=fe,M=z}if(I.done)return n(d,M),$&&jt(d,P),C;if(M===null){for(;!I.done;P++,I=f.next())I=h(d,I.value,x),I!==null&&(c=o(I,c,P),S===null?C=I:S.sibling=I,S=I);return $&&jt(d,P),C}for(M=r(d,M);!I.done;P++,I=f.next())I=v(M,d,P,I.value,x),I!==null&&(e&&I.alternate!==null&&M.delete(I.key===null?P:I.key),c=o(I,c,P),S===null?C=I:S.sibling=I,S=I);return e&&M.forEach(function(Ne){return t(d,Ne)}),$&&jt(d,P),C}function O(d,c,f,x){if(typeof f=="object"&&f!==null&&f.type===Yt&&f.key===null&&(f=f.props.children),typeof f=="object"&&f!==null){switch(f.$$typeof){case Dr:e:{for(var C=f.key,S=c;S!==null;){if(S.key===C){if(C=f.type,C===Yt){if(S.tag===7){n(d,S.sibling),c=i(S,f.props.children),c.return=d,d=c;break e}}else if(S.elementType===C||typeof C=="object"&&C!==null&&C.$$typeof===ut&&za(C)===S.type){n(d,S.sibling),c=i(S,f.props),c.ref=tr(d,S,f),c.return=d,d=c;break e}n(d,S);break}else t(d,S);S=S.sibling}f.type===Yt?(c=Vt(f.props.children,d.mode,x,f.key),c.return=d,d=c):(x=Ti(f.type,f.key,f.props,null,d.mode,x),x.ref=tr(d,c,f),x.return=d,d=x)}return l(d);case Gt:e:{for(S=f.key;c!==null;){if(c.key===S)if(c.tag===4&&c.stateNode.containerInfo===f.containerInfo&&c.stateNode.implementation===f.implementation){n(d,c.sibling),c=i(c,f.children||[]),c.return=d,d=c;break e}else{n(d,c);break}else t(d,c);c=c.sibling}c=lu(f,d.mode,x),c.return=d,d=c}return l(d);case ut:return S=f._init,O(d,c,S(f._payload),x)}if(On(f))return y(d,c,f,x);if(Nn(f))return _(d,c,f,x);mi(d,f)}return typeof f=="string"&&f!==""||typeof f=="number"?(f=""+f,c!==null&&c.tag===6?(n(d,c.sibling),c=i(c,f),c.return=d,d=c):(n(d,c),c=ou(f,d.mode,x),c.return=d,d=c),l(d)):n(d,c)}return O}var vn=Aa(!0),Ua=Aa(!1),nr={},Ke=vt(nr),rr=vt(nr),ir=vt(nr);function zt(e){if(e===nr)throw Error(w(174));return e}function Cl(e,t){switch(R(ir,t),R(rr,e),R(Ke,nr),e=t.nodeType,e){case 9:case 11:t=(t=t.documentElement)?t.namespaceURI:So(null,"");break;default:e=e===8?t.parentNode:t,t=e.namespaceURI||null,e=e.tagName,t=So(t,e)}U(Ke),R(Ke,t)}function yn(){U(Ke),U(rr),U(ir)}function Qa(e){zt(ir.current);var t=zt(Ke.current),n=So(t,e.type);t!==n&&(R(rr,e),R(Ke,n))}function kl(e){rr.current===e&&(U(Ke),U(rr))}var V=vt(0);function vi(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||n.data==="$!"))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==void 0){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var El=[];function Ml(){for(var e=0;e<El.length;e++)El[e]._workInProgressVersionPrimary=null;El.length=0}var yi=Ye.ReactCurrentDispatcher,Pl=Ye.ReactCurrentBatchConfig,At=0,W=null,X=null,ee=null,gi=!1,or=!1,lr=0,Fp=0;function se(){throw Error(w(321))}function Nl(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!ze(e[n],t[n]))return!1;return!0}function Il(e,t,n,r,i,o){if(At=o,W=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,yi.current=e===null||e.memoizedState===null?Rp:zp,e=n(r,i),or){o=0;do{if(or=!1,lr=0,25<=o)throw Error(w(301));o+=1,ee=X=null,t.updateQueue=null,yi.current=Ap,e=n(r,i)}while(or)}if(yi.current=wi,t=X!==null&&X.next!==null,At=0,ee=X=W=null,gi=!1,t)throw Error(w(300));return e}function Ol(){var e=lr!==0;return lr=0,e}function qe(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return ee===null?W.memoizedState=ee=e:ee=ee.next=e,ee}function Le(){if(X===null){var e=W.alternate;e=e!==null?e.memoizedState:null}else e=X.next;var t=ee===null?W.memoizedState:ee.next;if(t!==null)ee=t,X=e;else{if(e===null)throw Error(w(310));X=e,e={memoizedState:X.memoizedState,baseState:X.baseState,baseQueue:X.baseQueue,queue:X.queue,next:null},ee===null?W.memoizedState=ee=e:ee=ee.next=e}return ee}function ur(e,t){return typeof t=="function"?t(e):t}function Dl(e){var t=Le(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=X,i=r.baseQueue,o=n.pending;if(o!==null){if(i!==null){var l=i.next;i.next=o.next,o.next=l}r.baseQueue=i=o,n.pending=null}if(i!==null){o=i.next,r=r.baseState;var u=l=null,s=null,a=o;do{var m=a.lane;if((At&m)===m)s!==null&&(s=s.next={lane:0,action:a.action,hasEagerState:a.hasEagerState,eagerState:a.eagerState,next:null}),r=a.hasEagerState?a.eagerState:e(r,a.action);else{var h={lane:m,action:a.action,hasEagerState:a.hasEagerState,eagerState:a.eagerState,next:null};s===null?(u=s=h,l=r):s=s.next=h,W.lanes|=m,Ut|=m}a=a.next}while(a!==null&&a!==o);s===null?l=r:s.next=u,ze(r,t.memoizedState)||(ge=!0),t.memoizedState=r,t.baseState=l,t.baseQueue=s,n.lastRenderedState=r}if(e=n.interleaved,e!==null){i=e;do o=i.lane,W.lanes|=o,Ut|=o,i=i.next;while(i!==e)}else i===null&&(n.lanes=0);return[t.memoizedState,n.dispatch]}function Fl(e){var t=Le(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=n.dispatch,i=n.pending,o=t.memoizedState;if(i!==null){n.pending=null;var l=i=i.next;do o=e(o,l.action),l=l.next;while(l!==i);ze(o,t.memoizedState)||(ge=!0),t.memoizedState=o,t.baseQueue===null&&(t.baseState=o),n.lastRenderedState=o}return[o,r]}function $a(){}function Ba(e,t){var n=W,r=Le(),i=t(),o=!ze(r.memoizedState,i);if(o&&(r.memoizedState=i,ge=!0),r=r.queue,Ll(Ha.bind(null,n,r,e),[e]),r.getSnapshot!==t||o||ee!==null&&ee.memoizedState.tag&1){if(n.flags|=2048,sr(9,Wa.bind(null,n,r,i,t),void 0,null),te===null)throw Error(w(349));At&30||Va(n,t,i)}return i}function Va(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=W.updateQueue,t===null?(t={lastEffect:null,stores:null},W.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Wa(e,t,n,r){t.value=n,t.getSnapshot=r,Ka(t)&&qa(e)}function Ha(e,t,n){return n(function(){Ka(t)&&qa(e)})}function Ka(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!ze(e,n)}catch{return!0}}function qa(e){var t=tt(e,1);t!==null&&Be(t,e,1,-1)}function ba(e){var t=qe();return typeof e=="function"&&(e=e()),t.memoizedState=t.baseState=e,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:ur,lastRenderedState:e},t.queue=e,e=e.dispatch=jp.bind(null,W,e),[t.memoizedState,e]}function sr(e,t,n,r){return e={tag:e,create:t,destroy:n,deps:r,next:null},t=W.updateQueue,t===null?(t={lastEffect:null,stores:null},W.updateQueue=t,t.lastEffect=e.next=e):(n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e)),e}function Ga(){return Le().memoizedState}function _i(e,t,n,r){var i=qe();W.flags|=e,i.memoizedState=sr(1|t,n,void 0,r===void 0?null:r)}function xi(e,t,n,r){var i=Le();r=r===void 0?null:r;var o=void 0;if(X!==null){var l=X.memoizedState;if(o=l.destroy,r!==null&&Nl(r,l.deps)){i.memoizedState=sr(t,n,o,r);return}}W.flags|=e,i.memoizedState=sr(1|t,n,o,r)}function Ya(e,t){return _i(8390656,8,e,t)}function Ll(e,t){return xi(2048,8,e,t)}function Xa(e,t){return xi(4,2,e,t)}function Za(e,t){return xi(4,4,e,t)}function Ja(e,t){if(typeof t=="function")return e=e(),t(e),function(){t(null)};if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function ec(e,t,n){return n=n!=null?n.concat([e]):null,xi(4,4,Ja.bind(null,t,e),n)}function Tl(){}function tc(e,t){var n=Le();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Nl(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function nc(e,t){var n=Le();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Nl(t,r[1])?r[0]:(e=e(),n.memoizedState=[e,t],e)}function rc(e,t,n){return At&21?(ze(n,t)||(n=Is(),W.lanes|=n,Ut|=n,e.baseState=!0),t):(e.baseState&&(e.baseState=!1,ge=!0),e.memoizedState=n)}function Lp(e,t){var n=j;j=n!==0&&4>n?n:4,e(!0);var r=Pl.transition;Pl.transition={};try{e(!1),t()}finally{j=n,Pl.transition=r}}function ic(){return Le().memoizedState}function Tp(e,t,n){var r=kt(e);if(n={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null},oc(e))lc(t,n);else if(n=Ia(e,t,n,r),n!==null){var i=me();Be(n,e,r,i),uc(n,t,r)}}function jp(e,t,n){var r=kt(e),i={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null};if(oc(e))lc(t,i);else{var o=e.alternate;if(e.lanes===0&&(o===null||o.lanes===0)&&(o=t.lastRenderedReducer,o!==null))try{var l=t.lastRenderedState,u=o(l,n);if(i.hasEagerState=!0,i.eagerState=u,ze(u,l)){var s=t.interleaved;s===null?(i.next=i,_l(t)):(i.next=s.next,s.next=i),t.interleaved=i;return}}catch{}finally{}n=Ia(e,t,i,r),n!==null&&(i=me(),Be(n,e,r,i),uc(n,t,r))}}function oc(e){var t=e.alternate;return e===W||t!==null&&t===W}function lc(e,t){or=gi=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function uc(e,t,n){if(n&4194240){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,To(e,n)}}var wi={readContext:Fe,useCallback:se,useContext:se,useEffect:se,useImperativeHandle:se,useInsertionEffect:se,useLayoutEffect:se,useMemo:se,useReducer:se,useRef:se,useState:se,useDebugValue:se,useDeferredValue:se,useTransition:se,useMutableSource:se,useSyncExternalStore:se,useId:se,unstable_isNewReconciler:!1},Rp={readContext:Fe,useCallback:function(e,t){return qe().memoizedState=[e,t===void 0?null:t],e},useContext:Fe,useEffect:Ya,useImperativeHandle:function(e,t,n){return n=n!=null?n.concat([e]):null,_i(4194308,4,Ja.bind(null,t,e),n)},useLayoutEffect:function(e,t){return _i(4194308,4,e,t)},useInsertionEffect:function(e,t){return _i(4,2,e,t)},useMemo:function(e,t){var n=qe();return t=t===void 0?null:t,e=e(),n.memoizedState=[e,t],e},useReducer:function(e,t,n){var r=qe();return t=n!==void 0?n(t):t,r.memoizedState=r.baseState=t,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:t},r.queue=e,e=e.dispatch=Tp.bind(null,W,e),[r.memoizedState,e]},useRef:function(e){var t=qe();return e={current:e},t.memoizedState=e},useState:ba,useDebugValue:Tl,useDeferredValue:function(e){return qe().memoizedState=e},useTransition:function(){var e=ba(!1),t=e[0];return e=Lp.bind(null,e[1]),qe().memoizedState=e,[t,e]},useMutableSource:function(){},useSyncExternalStore:function(e,t,n){var r=W,i=qe();if($){if(n===void 0)throw Error(w(407));n=n()}else{if(n=t(),te===null)throw Error(w(349));At&30||Va(r,t,n)}i.memoizedState=n;var o={value:n,getSnapshot:t};return i.queue=o,Ya(Ha.bind(null,r,o,e),[e]),r.flags|=2048,sr(9,Wa.bind(null,r,o,n,t),void 0,null),n},useId:function(){var e=qe(),t=te.identifierPrefix;if($){var n=et,r=Je;n=(r&~(1<<32-Re(r)-1)).toString(32)+n,t=":"+t+"R"+n,n=lr++,0<n&&(t+="H"+n.toString(32)),t+=":"}else n=Fp++,t=":"+t+"r"+n.toString(32)+":";return e.memoizedState=t},unstable_isNewReconciler:!1},zp={readContext:Fe,useCallback:tc,useContext:Fe,useEffect:Ll,useImperativeHandle:ec,useInsertionEffect:Xa,useLayoutEffect:Za,useMemo:nc,useReducer:Dl,useRef:Ga,useState:function(){return Dl(ur)},useDebugValue:Tl,useDeferredValue:function(e){var t=Le();return rc(t,X.memoizedState,e)},useTransition:function(){var e=Dl(ur)[0],t=Le().memoizedState;return[e,t]},useMutableSource:$a,useSyncExternalStore:Ba,useId:ic,unstable_isNewReconciler:!1},Ap={readContext:Fe,useCallback:tc,useContext:Fe,useEffect:Ll,useImperativeHandle:ec,useInsertionEffect:Xa,useLayoutEffect:Za,useMemo:nc,useReducer:Fl,useRef:Ga,useState:function(){return Fl(ur)},useDebugValue:Tl,useDeferredValue:function(e){var t=Le();return X===null?t.memoizedState=e:rc(t,X.memoizedState,e)},useTransition:function(){var e=Fl(ur)[0],t=Le().memoizedState;return[e,t]},useMutableSource:$a,useSyncExternalStore:Ba,useId:ic,unstable_isNewReconciler:!1};function gn(e,t){try{var n="",r=t;do n+=dd(r),r=r.return;while(r);var i=n}catch(o){i=`
Error generating stack: `+o.message+`
`+o.stack}return{value:e,source:t,stack:i,digest:null}}function jl(e,t,n){return{value:e,source:null,stack:n??null,digest:t??null}}function Rl(e,t){try{console.error(t.value)}catch(n){setTimeout(function(){throw n})}}var Up=typeof WeakMap=="function"?WeakMap:Map;function sc(e,t,n){n=nt(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){Ni||(Ni=!0,Xl=r),Rl(e,t)},n}function ac(e,t,n){n=nt(-1,n),n.tag=3;var r=e.type.getDerivedStateFromError;if(typeof r=="function"){var i=t.value;n.payload=function(){return r(i)},n.callback=function(){Rl(e,t)}}var o=e.stateNode;return o!==null&&typeof o.componentDidCatch=="function"&&(n.callback=function(){Rl(e,t),typeof r!="function"&&(St===null?St=new Set([this]):St.add(this));var l=t.stack;this.componentDidCatch(t.value,{componentStack:l!==null?l:""})}),n}function cc(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new Up;var i=new Set;r.set(t,i)}else i=r.get(t),i===void 0&&(i=new Set,r.set(t,i));i.has(n)||(i.add(n),e=Jp.bind(null,e,t,n),t.then(e,e))}function fc(e){do{var t;if((t=e.tag===13)&&(t=e.memoizedState,t=t!==null?t.dehydrated!==null:!0),t)return e;e=e.return}while(e!==null);return null}function dc(e,t,n,r,i){return e.mode&1?(e.flags|=65536,e.lanes=i,e):(e===t?e.flags|=65536:(e.flags|=128,n.flags|=131072,n.flags&=-52805,n.tag===1&&(n.alternate===null?n.tag=17:(t=nt(-1,1),t.tag=2,xt(n,t,1))),n.lanes|=1),e)}var Qp=Ye.ReactCurrentOwner,ge=!1;function he(e,t,n,r){t.child=e===null?Ua(t,null,n,r):vn(t,e.child,n,r)}function pc(e,t,n,r,i){n=n.render;var o=t.ref;return mn(t,i),r=Il(e,t,n,r,o,i),n=Ol(),e!==null&&!ge?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~i,rt(e,t,i)):($&&n&&cl(t),t.flags|=1,he(e,t,r,i),t.child)}function hc(e,t,n,r,i){if(e===null){var o=n.type;return typeof o=="function"&&!iu(o)&&o.defaultProps===void 0&&n.compare===null&&n.defaultProps===void 0?(t.tag=15,t.type=o,mc(e,t,o,r,i)):(e=Ti(n.type,null,r,t,t.mode,i),e.ref=t.ref,e.return=t,t.child=e)}if(o=e.child,!(e.lanes&i)){var l=o.memoizedProps;if(n=n.compare,n=n!==null?n:bn,n(l,r)&&e.ref===t.ref)return rt(e,t,i)}return t.flags|=1,e=Mt(o,r),e.ref=t.ref,e.return=t,t.child=e}function mc(e,t,n,r,i){if(e!==null){var o=e.memoizedProps;if(bn(o,r)&&e.ref===t.ref)if(ge=!1,t.pendingProps=r=o,(e.lanes&i)!==0)e.flags&131072&&(ge=!0);else return t.lanes=e.lanes,rt(e,t,i)}return zl(e,t,n,r,i)}function vc(e,t,n){var r=t.pendingProps,i=r.children,o=e!==null?e.memoizedState:null;if(r.mode==="hidden")if(!(t.mode&1))t.memoizedState={baseLanes:0,cachePool:null,transitions:null},R(xn,Pe),Pe|=n;else{if(!(n&1073741824))return e=o!==null?o.baseLanes|n:n,t.lanes=t.childLanes=1073741824,t.memoizedState={baseLanes:e,cachePool:null,transitions:null},t.updateQueue=null,R(xn,Pe),Pe|=e,null;t.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=o!==null?o.baseLanes:n,R(xn,Pe),Pe|=r}else o!==null?(r=o.baseLanes|n,t.memoizedState=null):r=n,R(xn,Pe),Pe|=r;return he(e,t,i,n),t.child}function yc(e,t){var n=t.ref;(e===null&&n!==null||e!==null&&e.ref!==n)&&(t.flags|=512,t.flags|=2097152)}function zl(e,t,n,r,i){var o=ye(n)?Lt:ue.current;return o=cn(t,o),mn(t,i),n=Il(e,t,n,r,o,i),r=Ol(),e!==null&&!ge?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~i,rt(e,t,i)):($&&r&&cl(t),t.flags|=1,he(e,t,n,i),t.child)}function gc(e,t,n,r,i){if(ye(n)){var o=!0;oi(t)}else o=!1;if(mn(t,i),t.stateNode===null)Ci(e,t),ja(t,n,r),Sl(t,n,r,i),r=!0;else if(e===null){var l=t.stateNode,u=t.memoizedProps;l.props=u;var s=l.context,a=n.contextType;typeof a=="object"&&a!==null?a=Fe(a):(a=ye(n)?Lt:ue.current,a=cn(t,a));var m=n.getDerivedStateFromProps,h=typeof m=="function"||typeof l.getSnapshotBeforeUpdate=="function";h||typeof l.UNSAFE_componentWillReceiveProps!="function"&&typeof l.componentWillReceiveProps!="function"||(u!==r||s!==a)&&Ra(t,l,r,a),_t=!1;var p=t.memoizedState;l.state=p,pi(t,r,l,i),s=t.memoizedState,u!==r||p!==s||ve.current||_t?(typeof m=="function"&&(wl(t,n,m,r),s=t.memoizedState),(u=_t||Ta(t,n,u,r,p,s,a))?(h||typeof l.UNSAFE_componentWillMount!="function"&&typeof l.componentWillMount!="function"||(typeof l.componentWillMount=="function"&&l.componentWillMount(),typeof l.UNSAFE_componentWillMount=="function"&&l.UNSAFE_componentWillMount()),typeof l.componentDidMount=="function"&&(t.flags|=4194308)):(typeof l.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=s),l.props=r,l.state=s,l.context=a,r=u):(typeof l.componentDidMount=="function"&&(t.flags|=4194308),r=!1)}else{l=t.stateNode,Oa(e,t),u=t.memoizedProps,a=t.type===t.elementType?u:Ue(t.type,u),l.props=a,h=t.pendingProps,p=l.context,s=n.contextType,typeof s=="object"&&s!==null?s=Fe(s):(s=ye(n)?Lt:ue.current,s=cn(t,s));var v=n.getDerivedStateFromProps;(m=typeof v=="function"||typeof l.getSnapshotBeforeUpdate=="function")||typeof l.UNSAFE_componentWillReceiveProps!="function"&&typeof l.componentWillReceiveProps!="function"||(u!==h||p!==s)&&Ra(t,l,r,s),_t=!1,p=t.memoizedState,l.state=p,pi(t,r,l,i);var y=t.memoizedState;u!==h||p!==y||ve.current||_t?(typeof v=="function"&&(wl(t,n,v,r),y=t.memoizedState),(a=_t||Ta(t,n,a,r,p,y,s)||!1)?(m||typeof l.UNSAFE_componentWillUpdate!="function"&&typeof l.componentWillUpdate!="function"||(typeof l.componentWillUpdate=="function"&&l.componentWillUpdate(r,y,s),typeof l.UNSAFE_componentWillUpdate=="function"&&l.UNSAFE_componentWillUpdate(r,y,s)),typeof l.componentDidUpdate=="function"&&(t.flags|=4),typeof l.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof l.componentDidUpdate!="function"||u===e.memoizedProps&&p===e.memoizedState||(t.flags|=4),typeof l.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&p===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=y),l.props=r,l.state=y,l.context=s,r=a):(typeof l.componentDidUpdate!="function"||u===e.memoizedProps&&p===e.memoizedState||(t.flags|=4),typeof l.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&p===e.memoizedState||(t.flags|=1024),r=!1)}return Al(e,t,n,r,o,i)}function Al(e,t,n,r,i,o){yc(e,t);var l=(t.flags&128)!==0;if(!r&&!l)return i&&Sa(t,n,!1),rt(e,t,o);r=t.stateNode,Qp.current=t;var u=l&&typeof n.getDerivedStateFromError!="function"?null:r.render();return t.flags|=1,e!==null&&l?(t.child=vn(t,e.child,null,o),t.child=vn(t,null,u,o)):he(e,t,u,o),t.memoizedState=r.state,i&&Sa(t,n,!0),t.child}function _c(e){var t=e.stateNode;t.pendingContext?xa(e,t.pendingContext,t.pendingContext!==t.context):t.context&&xa(e,t.context,!1),Cl(e,t.containerInfo)}function xc(e,t,n,r,i){return pn(),hl(i),t.flags|=256,he(e,t,n,r),t.child}var Ul={dehydrated:null,treeContext:null,retryLane:0};function Ql(e){return{baseLanes:e,cachePool:null,transitions:null}}function wc(e,t,n){var r=t.pendingProps,i=V.current,o=!1,l=(t.flags&128)!==0,u;if((u=l)||(u=e!==null&&e.memoizedState===null?!1:(i&2)!==0),u?(o=!0,t.flags&=-129):(e===null||e.memoizedState!==null)&&(i|=1),R(V,i&1),e===null)return pl(t),e=t.memoizedState,e!==null&&(e=e.dehydrated,e!==null)?(t.mode&1?e.data==="$!"?t.lanes=8:t.lanes=1073741824:t.lanes=1,null):(l=r.children,e=r.fallback,o?(r=t.mode,o=t.child,l={mode:"hidden",children:l},!(r&1)&&o!==null?(o.childLanes=0,o.pendingProps=l):o=ji(l,r,0,null),e=Vt(e,r,n,null),o.return=t,e.return=t,o.sibling=e,t.child=o,t.child.memoizedState=Ql(n),t.memoizedState=Ul,e):$l(t,l));if(i=e.memoizedState,i!==null&&(u=i.dehydrated,u!==null))return $p(e,t,l,r,u,i,n);if(o){o=r.fallback,l=t.mode,i=e.child,u=i.sibling;var s={mode:"hidden",children:r.children};return!(l&1)&&t.child!==i?(r=t.child,r.childLanes=0,r.pendingProps=s,t.deletions=null):(r=Mt(i,s),r.subtreeFlags=i.subtreeFlags&14680064),u!==null?o=Mt(u,o):(o=Vt(o,l,n,null),o.flags|=2),o.return=t,r.return=t,r.sibling=o,t.child=r,r=o,o=t.child,l=e.child.memoizedState,l=l===null?Ql(n):{baseLanes:l.baseLanes|n,cachePool:null,transitions:l.transitions},o.memoizedState=l,o.childLanes=e.childLanes&~n,t.memoizedState=Ul,r}return o=e.child,e=o.sibling,r=Mt(o,{mode:"visible",children:r.children}),!(t.mode&1)&&(r.lanes=n),r.return=t,r.sibling=null,e!==null&&(n=t.deletions,n===null?(t.deletions=[e],t.flags|=16):n.push(e)),t.child=r,t.memoizedState=null,r}function $l(e,t){return t=ji({mode:"visible",children:t},e.mode,0,null),t.return=e,e.child=t}function Si(e,t,n,r){return r!==null&&hl(r),vn(t,e.child,null,n),e=$l(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function $p(e,t,n,r,i,o,l){if(n)return t.flags&256?(t.flags&=-257,r=jl(Error(w(422))),Si(e,t,l,r)):t.memoizedState!==null?(t.child=e.child,t.flags|=128,null):(o=r.fallback,i=t.mode,r=ji({mode:"visible",children:r.children},i,0,null),o=Vt(o,i,l,null),o.flags|=2,r.return=t,o.return=t,r.sibling=o,t.child=r,t.mode&1&&vn(t,e.child,null,l),t.child.memoizedState=Ql(l),t.memoizedState=Ul,o);if(!(t.mode&1))return Si(e,t,l,null);if(i.data==="$!"){if(r=i.nextSibling&&i.nextSibling.dataset,r)var u=r.dgst;return r=u,o=Error(w(419)),r=jl(o,r,void 0),Si(e,t,l,r)}if(u=(l&e.childLanes)!==0,ge||u){if(r=te,r!==null){switch(l&-l){case 4:i=2;break;case 16:i=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:i=32;break;case 536870912:i=268435456;break;default:i=0}i=i&(r.suspendedLanes|l)?0:i,i!==0&&i!==o.retryLane&&(o.retryLane=i,tt(e,i),Be(r,e,i,-1))}return ru(),r=jl(Error(w(421))),Si(e,t,l,r)}return i.data==="$?"?(t.flags|=128,t.child=e.child,t=eh.bind(null,e),i._reactRetry=t,null):(e=o.treeContext,Me=mt(i.nextSibling),Ee=t,$=!0,Ae=null,e!==null&&(Oe[De++]=Je,Oe[De++]=et,Oe[De++]=Tt,Je=e.id,et=e.overflow,Tt=t),t=$l(t,r.children),t.flags|=4096,t)}function Sc(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),gl(e.return,t,n)}function Bl(e,t,n,r,i){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:i}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=r,o.tail=n,o.tailMode=i)}function Cc(e,t,n){var r=t.pendingProps,i=r.revealOrder,o=r.tail;if(he(e,t,r.children,n),r=V.current,r&2)r=r&1|2,t.flags|=128;else{if(e!==null&&e.flags&128)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Sc(e,n,t);else if(e.tag===19)Sc(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}r&=1}if(R(V,r),!(t.mode&1))t.memoizedState=null;else switch(i){case"forwards":for(n=t.child,i=null;n!==null;)e=n.alternate,e!==null&&vi(e)===null&&(i=n),n=n.sibling;n=i,n===null?(i=t.child,t.child=null):(i=n.sibling,n.sibling=null),Bl(t,!1,i,n,o);break;case"backwards":for(n=null,i=t.child,t.child=null;i!==null;){if(e=i.alternate,e!==null&&vi(e)===null){t.child=i;break}e=i.sibling,i.sibling=n,n=i,i=e}Bl(t,!0,n,null,o);break;case"together":Bl(t,!1,null,null,void 0);break;default:t.memoizedState=null}return t.child}function Ci(e,t){!(t.mode&1)&&e!==null&&(e.alternate=null,t.alternate=null,t.flags|=2)}function rt(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),Ut|=t.lanes,!(n&t.childLanes))return null;if(e!==null&&t.child!==e.child)throw Error(w(153));if(t.child!==null){for(e=t.child,n=Mt(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=Mt(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function Bp(e,t,n){switch(t.tag){case 3:_c(t),pn();break;case 5:Qa(t);break;case 1:ye(t.type)&&oi(t);break;case 4:Cl(t,t.stateNode.containerInfo);break;case 10:var r=t.type._context,i=t.memoizedProps.value;R(ci,r._currentValue),r._currentValue=i;break;case 13:if(r=t.memoizedState,r!==null)return r.dehydrated!==null?(R(V,V.current&1),t.flags|=128,null):n&t.child.childLanes?wc(e,t,n):(R(V,V.current&1),e=rt(e,t,n),e!==null?e.sibling:null);R(V,V.current&1);break;case 19:if(r=(n&t.childLanes)!==0,e.flags&128){if(r)return Cc(e,t,n);t.flags|=128}if(i=t.memoizedState,i!==null&&(i.rendering=null,i.tail=null,i.lastEffect=null),R(V,V.current),r)break;return null;case 22:case 23:return t.lanes=0,vc(e,t,n)}return rt(e,t,n)}var kc,Vl,Ec,Mc;kc=function(e,t){for(var n=t.child;n!==null;){if(n.tag===5||n.tag===6)e.appendChild(n.stateNode);else if(n.tag!==4&&n.child!==null){n.child.return=n,n=n.child;continue}if(n===t)break;for(;n.sibling===null;){if(n.return===null||n.return===t)return;n=n.return}n.sibling.return=n.return,n=n.sibling}},Vl=function(){},Ec=function(e,t,n,r){var i=e.memoizedProps;if(i!==r){e=t.stateNode,zt(Ke.current);var o=null;switch(n){case"input":i=go(e,i),r=go(e,r),o=[];break;case"select":i=B({},i,{value:void 0}),r=B({},r,{value:void 0}),o=[];break;case"textarea":i=wo(e,i),r=wo(e,r),o=[];break;default:typeof i.onClick!="function"&&typeof r.onClick=="function"&&(e.onclick=ni)}Co(n,r);var l;n=null;for(a in i)if(!r.hasOwnProperty(a)&&i.hasOwnProperty(a)&&i[a]!=null)if(a==="style"){var u=i[a];for(l in u)u.hasOwnProperty(l)&&(n||(n={}),n[l]="")}else a!=="dangerouslySetInnerHTML"&&a!=="children"&&a!=="suppressContentEditableWarning"&&a!=="suppressHydrationWarning"&&a!=="autoFocus"&&(Pn.hasOwnProperty(a)?o||(o=[]):(o=o||[]).push(a,null));for(a in r){var s=r[a];if(u=i!=null?i[a]:void 0,r.hasOwnProperty(a)&&s!==u&&(s!=null||u!=null))if(a==="style")if(u){for(l in u)!u.hasOwnProperty(l)||s&&s.hasOwnProperty(l)||(n||(n={}),n[l]="");for(l in s)s.hasOwnProperty(l)&&u[l]!==s[l]&&(n||(n={}),n[l]=s[l])}else n||(o||(o=[]),o.push(a,n)),n=s;else a==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,u=u?u.__html:void 0,s!=null&&u!==s&&(o=o||[]).push(a,s)):a==="children"?typeof s!="string"&&typeof s!="number"||(o=o||[]).push(a,""+s):a!=="suppressContentEditableWarning"&&a!=="suppressHydrationWarning"&&(Pn.hasOwnProperty(a)?(s!=null&&a==="onScroll"&&A("scroll",e),o||u===s||(o=[])):(o=o||[]).push(a,s))}n&&(o=o||[]).push("style",n);var a=o;(t.updateQueue=a)&&(t.flags|=4)}},Mc=function(e,t,n,r){n!==r&&(t.flags|=4)};function ar(e,t){if(!$)switch(e.tailMode){case"hidden":t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case"collapsed":n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function ae(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags&14680064,r|=i.flags&14680064,i.return=e,i=i.sibling;else for(i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags,r|=i.flags,i.return=e,i=i.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function Vp(e,t,n){var r=t.pendingProps;switch(fl(t),t.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return ae(t),null;case 1:return ye(t.type)&&ii(),ae(t),null;case 3:return r=t.stateNode,yn(),U(ve),U(ue),Ml(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(e===null||e.child===null)&&(ai(t)?t.flags|=4:e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,Ae!==null&&(eu(Ae),Ae=null))),Vl(e,t),ae(t),null;case 5:kl(t);var i=zt(ir.current);if(n=t.type,e!==null&&t.stateNode!=null)Ec(e,t,n,r,i),e.ref!==t.ref&&(t.flags|=512,t.flags|=2097152);else{if(!r){if(t.stateNode===null)throw Error(w(166));return ae(t),null}if(e=zt(Ke.current),ai(t)){r=t.stateNode,n=t.type;var o=t.memoizedProps;switch(r[He]=t,r[Jn]=o,e=(t.mode&1)!==0,n){case"dialog":A("cancel",r),A("close",r);break;case"iframe":case"object":case"embed":A("load",r);break;case"video":case"audio":for(i=0;i<Yn.length;i++)A(Yn[i],r);break;case"source":A("error",r);break;case"img":case"image":case"link":A("error",r),A("load",r);break;case"details":A("toggle",r);break;case"input":os(r,o),A("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!o.multiple},A("invalid",r);break;case"textarea":ss(r,o),A("invalid",r)}Co(n,o),i=null;for(var l in o)if(o.hasOwnProperty(l)){var u=o[l];l==="children"?typeof u=="string"?r.textContent!==u&&(o.suppressHydrationWarning!==!0&&ti(r.textContent,u,e),i=["children",u]):typeof u=="number"&&r.textContent!==""+u&&(o.suppressHydrationWarning!==!0&&ti(r.textContent,u,e),i=["children",""+u]):Pn.hasOwnProperty(l)&&u!=null&&l==="onScroll"&&A("scroll",r)}switch(n){case"input":Fr(r),us(r,o,!0);break;case"textarea":Fr(r),cs(r);break;case"select":case"option":break;default:typeof o.onClick=="function"&&(r.onclick=ni)}r=i,t.updateQueue=r,r!==null&&(t.flags|=4)}else{l=i.nodeType===9?i:i.ownerDocument,e==="http://www.w3.org/1999/xhtml"&&(e=fs(n)),e==="http://www.w3.org/1999/xhtml"?n==="script"?(e=l.createElement("div"),e.innerHTML="<script><\/script>",e=e.removeChild(e.firstChild)):typeof r.is=="string"?e=l.createElement(n,{is:r.is}):(e=l.createElement(n),n==="select"&&(l=e,r.multiple?l.multiple=!0:r.size&&(l.size=r.size))):e=l.createElementNS(e,n),e[He]=t,e[Jn]=r,kc(e,t,!1,!1),t.stateNode=e;e:{switch(l=ko(n,r),n){case"dialog":A("cancel",e),A("close",e),i=r;break;case"iframe":case"object":case"embed":A("load",e),i=r;break;case"video":case"audio":for(i=0;i<Yn.length;i++)A(Yn[i],e);i=r;break;case"source":A("error",e),i=r;break;case"img":case"image":case"link":A("error",e),A("load",e),i=r;break;case"details":A("toggle",e),i=r;break;case"input":os(e,r),i=go(e,r),A("invalid",e);break;case"option":i=r;break;case"select":e._wrapperState={wasMultiple:!!r.multiple},i=B({},r,{value:void 0}),A("invalid",e);break;case"textarea":ss(e,r),i=wo(e,r),A("invalid",e);break;default:i=r}Co(n,i),u=i;for(o in u)if(u.hasOwnProperty(o)){var s=u[o];o==="style"?hs(e,s):o==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,s!=null&&ds(e,s)):o==="children"?typeof s=="string"?(n!=="textarea"||s!=="")&&Dn(e,s):typeof s=="number"&&Dn(e,""+s):o!=="suppressContentEditableWarning"&&o!=="suppressHydrationWarning"&&o!=="autoFocus"&&(Pn.hasOwnProperty(o)?s!=null&&o==="onScroll"&&A("scroll",e):s!=null&&lo(e,o,s,l))}switch(n){case"input":Fr(e),us(e,r,!1);break;case"textarea":Fr(e),cs(e);break;case"option":r.value!=null&&e.setAttribute("value",""+st(r.value));break;case"select":e.multiple=!!r.multiple,o=r.value,o!=null?Xt(e,!!r.multiple,o,!1):r.defaultValue!=null&&Xt(e,!!r.multiple,r.defaultValue,!0);break;default:typeof i.onClick=="function"&&(e.onclick=ni)}switch(n){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(t.flags|=4)}t.ref!==null&&(t.flags|=512,t.flags|=2097152)}return ae(t),null;case 6:if(e&&t.stateNode!=null)Mc(e,t,e.memoizedProps,r);else{if(typeof r!="string"&&t.stateNode===null)throw Error(w(166));if(n=zt(ir.current),zt(Ke.current),ai(t)){if(r=t.stateNode,n=t.memoizedProps,r[He]=t,(o=r.nodeValue!==n)&&(e=Ee,e!==null))switch(e.tag){case 3:ti(r.nodeValue,n,(e.mode&1)!==0);break;case 5:e.memoizedProps.suppressHydrationWarning!==!0&&ti(r.nodeValue,n,(e.mode&1)!==0)}o&&(t.flags|=4)}else r=(n.nodeType===9?n:n.ownerDocument).createTextNode(r),r[He]=t,t.stateNode=r}return ae(t),null;case 13:if(U(V),r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if($&&Me!==null&&t.mode&1&&!(t.flags&128))Na(),pn(),t.flags|=98560,o=!1;else if(o=ai(t),r!==null&&r.dehydrated!==null){if(e===null){if(!o)throw Error(w(318));if(o=t.memoizedState,o=o!==null?o.dehydrated:null,!o)throw Error(w(317));o[He]=t}else pn(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;ae(t),o=!1}else Ae!==null&&(eu(Ae),Ae=null),o=!0;if(!o)return t.flags&65536?t:null}return t.flags&128?(t.lanes=n,t):(r=r!==null,r!==(e!==null&&e.memoizedState!==null)&&r&&(t.child.flags|=8192,t.mode&1&&(e===null||V.current&1?Z===0&&(Z=3):ru())),t.updateQueue!==null&&(t.flags|=4),ae(t),null);case 4:return yn(),Vl(e,t),e===null&&Xn(t.stateNode.containerInfo),ae(t),null;case 10:return yl(t.type._context),ae(t),null;case 17:return ye(t.type)&&ii(),ae(t),null;case 19:if(U(V),o=t.memoizedState,o===null)return ae(t),null;if(r=(t.flags&128)!==0,l=o.rendering,l===null)if(r)ar(o,!1);else{if(Z!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(l=vi(e),l!==null){for(t.flags|=128,ar(o,!1),r=l.updateQueue,r!==null&&(t.updateQueue=r,t.flags|=4),t.subtreeFlags=0,r=n,n=t.child;n!==null;)o=n,e=r,o.flags&=14680066,l=o.alternate,l===null?(o.childLanes=0,o.lanes=e,o.child=null,o.subtreeFlags=0,o.memoizedProps=null,o.memoizedState=null,o.updateQueue=null,o.dependencies=null,o.stateNode=null):(o.childLanes=l.childLanes,o.lanes=l.lanes,o.child=l.child,o.subtreeFlags=0,o.deletions=null,o.memoizedProps=l.memoizedProps,o.memoizedState=l.memoizedState,o.updateQueue=l.updateQueue,o.type=l.type,e=l.dependencies,o.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),n=n.sibling;return R(V,V.current&1|2),t.child}e=e.sibling}o.tail!==null&&b()>wn&&(t.flags|=128,r=!0,ar(o,!1),t.lanes=4194304)}else{if(!r)if(e=vi(l),e!==null){if(t.flags|=128,r=!0,n=e.updateQueue,n!==null&&(t.updateQueue=n,t.flags|=4),ar(o,!0),o.tail===null&&o.tailMode==="hidden"&&!l.alternate&&!$)return ae(t),null}else 2*b()-o.renderingStartTime>wn&&n!==1073741824&&(t.flags|=128,r=!0,ar(o,!1),t.lanes=4194304);o.isBackwards?(l.sibling=t.child,t.child=l):(n=o.last,n!==null?n.sibling=l:t.child=l,o.last=l)}return o.tail!==null?(t=o.tail,o.rendering=t,o.tail=t.sibling,o.renderingStartTime=b(),t.sibling=null,n=V.current,R(V,r?n&1|2:n&1),t):(ae(t),null);case 22:case 23:return nu(),r=t.memoizedState!==null,e!==null&&e.memoizedState!==null!==r&&(t.flags|=8192),r&&t.mode&1?Pe&1073741824&&(ae(t),t.subtreeFlags&6&&(t.flags|=8192)):ae(t),null;case 24:return null;case 25:return null}throw Error(w(156,t.tag))}function Wp(e,t){switch(fl(t),t.tag){case 1:return ye(t.type)&&ii(),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return yn(),U(ve),U(ue),Ml(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 5:return kl(t),null;case 13:if(U(V),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(w(340));pn()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return U(V),null;case 4:return yn(),null;case 10:return yl(t.type._context),null;case 22:case 23:return nu(),null;case 24:return null;default:return null}}var ki=!1,ce=!1,Hp=typeof WeakSet=="function"?WeakSet:Set,E=null;function _n(e,t){var n=e.ref;if(n!==null)if(typeof n=="function")try{n(null)}catch(r){K(e,t,r)}else n.current=null}function Wl(e,t,n){try{n()}catch(r){K(e,t,r)}}var Pc=!1;function Kp(e,t){if(nl=Wr,e=ia(),bo(e)){if("selectionStart"in e)var n={start:e.selectionStart,end:e.selectionEnd};else e:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var i=r.anchorOffset,o=r.focusNode;r=r.focusOffset;try{n.nodeType,o.nodeType}catch{n=null;break e}var l=0,u=-1,s=-1,a=0,m=0,h=e,p=null;t:for(;;){for(var v;h!==n||i!==0&&h.nodeType!==3||(u=l+i),h!==o||r!==0&&h.nodeType!==3||(s=l+r),h.nodeType===3&&(l+=h.nodeValue.length),(v=h.firstChild)!==null;)p=h,h=v;for(;;){if(h===e)break t;if(p===n&&++a===i&&(u=l),p===o&&++m===r&&(s=l),(v=h.nextSibling)!==null)break;h=p,p=h.parentNode}h=v}n=u===-1||s===-1?null:{start:u,end:s}}else n=null}n=n||{start:0,end:0}}else n=null;for(rl={focusedElem:e,selectionRange:n},Wr=!1,E=t;E!==null;)if(t=E,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,E=e;else for(;E!==null;){t=E;try{var y=t.alternate;if(t.flags&1024)switch(t.tag){case 0:case 11:case 15:break;case 1:if(y!==null){var _=y.memoizedProps,O=y.memoizedState,d=t.stateNode,c=d.getSnapshotBeforeUpdate(t.elementType===t.type?_:Ue(t.type,_),O);d.__reactInternalSnapshotBeforeUpdate=c}break;case 3:var f=t.stateNode.containerInfo;f.nodeType===1?f.textContent="":f.nodeType===9&&f.documentElement&&f.removeChild(f.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(w(163))}}catch(x){K(t,t.return,x)}if(e=t.sibling,e!==null){e.return=t.return,E=e;break}E=t.return}return y=Pc,Pc=!1,y}function cr(e,t,n){var r=t.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var i=r=r.next;do{if((i.tag&e)===e){var o=i.destroy;i.destroy=void 0,o!==void 0&&Wl(t,n,o)}i=i.next}while(i!==r)}}function Ei(e,t){if(t=t.updateQueue,t=t!==null?t.lastEffect:null,t!==null){var n=t=t.next;do{if((n.tag&e)===e){var r=n.create;n.destroy=r()}n=n.next}while(n!==t)}}function Hl(e){var t=e.ref;if(t!==null){var n=e.stateNode;switch(e.tag){case 5:e=n;break;default:e=n}typeof t=="function"?t(e):t.current=e}}function Nc(e){var t=e.alternate;t!==null&&(e.alternate=null,Nc(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&(delete t[He],delete t[Jn],delete t[ul],delete t[Np],delete t[Ip])),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}function Ic(e){return e.tag===5||e.tag===3||e.tag===4}function Oc(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||Ic(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Kl(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.nodeType===8?n.parentNode.insertBefore(e,t):n.insertBefore(e,t):(n.nodeType===8?(t=n.parentNode,t.insertBefore(e,n)):(t=n,t.appendChild(e)),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=ni));else if(r!==4&&(e=e.child,e!==null))for(Kl(e,t,n),e=e.sibling;e!==null;)Kl(e,t,n),e=e.sibling}function ql(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(e=e.child,e!==null))for(ql(e,t,n),e=e.sibling;e!==null;)ql(e,t,n),e=e.sibling}var re=null,Qe=!1;function wt(e,t,n){for(n=n.child;n!==null;)Dc(e,t,n),n=n.sibling}function Dc(e,t,n){if(We&&typeof We.onCommitFiberUnmount=="function")try{We.onCommitFiberUnmount(Ar,n)}catch{}switch(n.tag){case 5:ce||_n(n,t);case 6:var r=re,i=Qe;re=null,wt(e,t,n),re=r,Qe=i,re!==null&&(Qe?(e=re,n=n.stateNode,e.nodeType===8?e.parentNode.removeChild(n):e.removeChild(n)):re.removeChild(n.stateNode));break;case 18:re!==null&&(Qe?(e=re,n=n.stateNode,e.nodeType===8?ll(e.parentNode,n):e.nodeType===1&&ll(e,n),Bn(e)):ll(re,n.stateNode));break;case 4:r=re,i=Qe,re=n.stateNode.containerInfo,Qe=!0,wt(e,t,n),re=r,Qe=i;break;case 0:case 11:case 14:case 15:if(!ce&&(r=n.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){i=r=r.next;do{var o=i,l=o.destroy;o=o.tag,l!==void 0&&(o&2||o&4)&&Wl(n,t,l),i=i.next}while(i!==r)}wt(e,t,n);break;case 1:if(!ce&&(_n(n,t),r=n.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=n.memoizedProps,r.state=n.memoizedState,r.componentWillUnmount()}catch(u){K(n,t,u)}wt(e,t,n);break;case 21:wt(e,t,n);break;case 22:n.mode&1?(ce=(r=ce)||n.memoizedState!==null,wt(e,t,n),ce=r):wt(e,t,n);break;default:wt(e,t,n)}}function Fc(e){var t=e.updateQueue;if(t!==null){e.updateQueue=null;var n=e.stateNode;n===null&&(n=e.stateNode=new Hp),t.forEach(function(r){var i=th.bind(null,e,r);n.has(r)||(n.add(r),r.then(i,i))})}}function $e(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var i=n[r];try{var o=e,l=t,u=l;e:for(;u!==null;){switch(u.tag){case 5:re=u.stateNode,Qe=!1;break e;case 3:re=u.stateNode.containerInfo,Qe=!0;break e;case 4:re=u.stateNode.containerInfo,Qe=!0;break e}u=u.return}if(re===null)throw Error(w(160));Dc(o,l,i),re=null,Qe=!1;var s=i.alternate;s!==null&&(s.return=null),i.return=null}catch(a){K(i,t,a)}}if(t.subtreeFlags&12854)for(t=t.child;t!==null;)Lc(t,e),t=t.sibling}function Lc(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if($e(t,e),be(e),r&4){try{cr(3,e,e.return),Ei(3,e)}catch(_){K(e,e.return,_)}try{cr(5,e,e.return)}catch(_){K(e,e.return,_)}}break;case 1:$e(t,e),be(e),r&512&&n!==null&&_n(n,n.return);break;case 5:if($e(t,e),be(e),r&512&&n!==null&&_n(n,n.return),e.flags&32){var i=e.stateNode;try{Dn(i,"")}catch(_){K(e,e.return,_)}}if(r&4&&(i=e.stateNode,i!=null)){var o=e.memoizedProps,l=n!==null?n.memoizedProps:o,u=e.type,s=e.updateQueue;if(e.updateQueue=null,s!==null)try{u==="input"&&o.type==="radio"&&o.name!=null&&ls(i,o),ko(u,l);var a=ko(u,o);for(l=0;l<s.length;l+=2){var m=s[l],h=s[l+1];m==="style"?hs(i,h):m==="dangerouslySetInnerHTML"?ds(i,h):m==="children"?Dn(i,h):lo(i,m,h,a)}switch(u){case"input":_o(i,o);break;case"textarea":as(i,o);break;case"select":var p=i._wrapperState.wasMultiple;i._wrapperState.wasMultiple=!!o.multiple;var v=o.value;v!=null?Xt(i,!!o.multiple,v,!1):p!==!!o.multiple&&(o.defaultValue!=null?Xt(i,!!o.multiple,o.defaultValue,!0):Xt(i,!!o.multiple,o.multiple?[]:"",!1))}i[Jn]=o}catch(_){K(e,e.return,_)}}break;case 6:if($e(t,e),be(e),r&4){if(e.stateNode===null)throw Error(w(162));i=e.stateNode,o=e.memoizedProps;try{i.nodeValue=o}catch(_){K(e,e.return,_)}}break;case 3:if($e(t,e),be(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{Bn(t.containerInfo)}catch(_){K(e,e.return,_)}break;case 4:$e(t,e),be(e);break;case 13:$e(t,e),be(e),i=e.child,i.flags&8192&&(o=i.memoizedState!==null,i.stateNode.isHidden=o,!o||i.alternate!==null&&i.alternate.memoizedState!==null||(Yl=b())),r&4&&Fc(e);break;case 22:if(m=n!==null&&n.memoizedState!==null,e.mode&1?(ce=(a=ce)||m,$e(t,e),ce=a):$e(t,e),be(e),r&8192){if(a=e.memoizedState!==null,(e.stateNode.isHidden=a)&&!m&&e.mode&1)for(E=e,m=e.child;m!==null;){for(h=E=m;E!==null;){switch(p=E,v=p.child,p.tag){case 0:case 11:case 14:case 15:cr(4,p,p.return);break;case 1:_n(p,p.return);var y=p.stateNode;if(typeof y.componentWillUnmount=="function"){r=p,n=p.return;try{t=r,y.props=t.memoizedProps,y.state=t.memoizedState,y.componentWillUnmount()}catch(_){K(r,n,_)}}break;case 5:_n(p,p.return);break;case 22:if(p.memoizedState!==null){Rc(h);continue}}v!==null?(v.return=p,E=v):Rc(h)}m=m.sibling}e:for(m=null,h=e;;){if(h.tag===5){if(m===null){m=h;try{i=h.stateNode,a?(o=i.style,typeof o.setProperty=="function"?o.setProperty("display","none","important"):o.display="none"):(u=h.stateNode,s=h.memoizedProps.style,l=s!=null&&s.hasOwnProperty("display")?s.display:null,u.style.display=ps("display",l))}catch(_){K(e,e.return,_)}}}else if(h.tag===6){if(m===null)try{h.stateNode.nodeValue=a?"":h.memoizedProps}catch(_){K(e,e.return,_)}}else if((h.tag!==22&&h.tag!==23||h.memoizedState===null||h===e)&&h.child!==null){h.child.return=h,h=h.child;continue}if(h===e)break e;for(;h.sibling===null;){if(h.return===null||h.return===e)break e;m===h&&(m=null),h=h.return}m===h&&(m=null),h.sibling.return=h.return,h=h.sibling}}break;case 19:$e(t,e),be(e),r&4&&Fc(e);break;case 21:break;default:$e(t,e),be(e)}}function be(e){var t=e.flags;if(t&2){try{e:{for(var n=e.return;n!==null;){if(Ic(n)){var r=n;break e}n=n.return}throw Error(w(160))}switch(r.tag){case 5:var i=r.stateNode;r.flags&32&&(Dn(i,""),r.flags&=-33);var o=Oc(e);ql(e,o,i);break;case 3:case 4:var l=r.stateNode.containerInfo,u=Oc(e);Kl(e,u,l);break;default:throw Error(w(161))}}catch(s){K(e,e.return,s)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function qp(e,t,n){E=e,Tc(e)}function Tc(e,t,n){for(var r=(e.mode&1)!==0;E!==null;){var i=E,o=i.child;if(i.tag===22&&r){var l=i.memoizedState!==null||ki;if(!l){var u=i.alternate,s=u!==null&&u.memoizedState!==null||ce;u=ki;var a=ce;if(ki=l,(ce=s)&&!a)for(E=i;E!==null;)l=E,s=l.child,l.tag===22&&l.memoizedState!==null?zc(i):s!==null?(s.return=l,E=s):zc(i);for(;o!==null;)E=o,Tc(o),o=o.sibling;E=i,ki=u,ce=a}jc(e)}else i.subtreeFlags&8772&&o!==null?(o.return=i,E=o):jc(e)}}function jc(e){for(;E!==null;){var t=E;if(t.flags&8772){var n=t.alternate;try{if(t.flags&8772)switch(t.tag){case 0:case 11:case 15:ce||Ei(5,t);break;case 1:var r=t.stateNode;if(t.flags&4&&!ce)if(n===null)r.componentDidMount();else{var i=t.elementType===t.type?n.memoizedProps:Ue(t.type,n.memoizedProps);r.componentDidUpdate(i,n.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var o=t.updateQueue;o!==null&&Fa(t,o,r);break;case 3:var l=t.updateQueue;if(l!==null){if(n=null,t.child!==null)switch(t.child.tag){case 5:n=t.child.stateNode;break;case 1:n=t.child.stateNode}Fa(t,l,n)}break;case 5:var u=t.stateNode;if(n===null&&t.flags&4){n=u;var s=t.memoizedProps;switch(t.type){case"button":case"input":case"select":case"textarea":s.autoFocus&&n.focus();break;case"img":s.src&&(n.src=s.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(t.memoizedState===null){var a=t.alternate;if(a!==null){var m=a.memoizedState;if(m!==null){var h=m.dehydrated;h!==null&&Bn(h)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(w(163))}ce||t.flags&512&&Hl(t)}catch(p){K(t,t.return,p)}}if(t===e){E=null;break}if(n=t.sibling,n!==null){n.return=t.return,E=n;break}E=t.return}}function Rc(e){for(;E!==null;){var t=E;if(t===e){E=null;break}var n=t.sibling;if(n!==null){n.return=t.return,E=n;break}E=t.return}}function zc(e){for(;E!==null;){var t=E;try{switch(t.tag){case 0:case 11:case 15:var n=t.return;try{Ei(4,t)}catch(s){K(t,n,s)}break;case 1:var r=t.stateNode;if(typeof r.componentDidMount=="function"){var i=t.return;try{r.componentDidMount()}catch(s){K(t,i,s)}}var o=t.return;try{Hl(t)}catch(s){K(t,o,s)}break;case 5:var l=t.return;try{Hl(t)}catch(s){K(t,l,s)}}}catch(s){K(t,t.return,s)}if(t===e){E=null;break}var u=t.sibling;if(u!==null){u.return=t.return,E=u;break}E=t.return}}var bp=Math.ceil,Mi=Ye.ReactCurrentDispatcher,bl=Ye.ReactCurrentOwner,Te=Ye.ReactCurrentBatchConfig,L=0,te=null,G=null,ie=0,Pe=0,xn=vt(0),Z=0,fr=null,Ut=0,Pi=0,Gl=0,dr=null,_e=null,Yl=0,wn=1/0,it=null,Ni=!1,Xl=null,St=null,Ii=!1,Ct=null,Oi=0,pr=0,Zl=null,Di=-1,Fi=0;function me(){return L&6?b():Di!==-1?Di:Di=b()}function kt(e){return e.mode&1?L&2&&ie!==0?ie&-ie:Dp.transition!==null?(Fi===0&&(Fi=Is()),Fi):(e=j,e!==0||(e=window.event,e=e===void 0?16:As(e.type)),e):1}function Be(e,t,n,r){if(50<pr)throw pr=0,Zl=null,Error(w(185));zn(e,n,r),(!(L&2)||e!==te)&&(e===te&&(!(L&2)&&(Pi|=n),Z===4&&Et(e,ie)),xe(e,r),n===1&&L===0&&!(t.mode&1)&&(wn=b()+500,li&&gt()))}function xe(e,t){var n=e.callbackNode;Dd(e,t);var r=$r(e,e===te?ie:0);if(r===0)n!==null&&Ms(n),e.callbackNode=null,e.callbackPriority=0;else if(t=r&-r,e.callbackPriority!==t){if(n!=null&&Ms(n),t===1)e.tag===0?Op(Uc.bind(null,e)):Ca(Uc.bind(null,e)),Mp(function(){!(L&6)&&gt()}),n=null;else{switch(Os(r)){case 1:n=Do;break;case 4:n=Ps;break;case 16:n=zr;break;case 536870912:n=Ns;break;default:n=zr}n=qc(n,Ac.bind(null,e))}e.callbackPriority=t,e.callbackNode=n}}function Ac(e,t){if(Di=-1,Fi=0,L&6)throw Error(w(327));var n=e.callbackNode;if(Sn()&&e.callbackNode!==n)return null;var r=$r(e,e===te?ie:0);if(r===0)return null;if(r&30||r&e.expiredLanes||t)t=Li(e,r);else{t=r;var i=L;L|=2;var o=$c();(te!==e||ie!==t)&&(it=null,wn=b()+500,$t(e,t));do try{Xp();break}catch(u){Qc(e,u)}while(!0);vl(),Mi.current=o,L=i,G!==null?t=0:(te=null,ie=0,t=Z)}if(t!==0){if(t===2&&(i=Fo(e),i!==0&&(r=i,t=Jl(e,i))),t===1)throw n=fr,$t(e,0),Et(e,r),xe(e,b()),n;if(t===6)Et(e,r);else{if(i=e.current.alternate,!(r&30)&&!Gp(i)&&(t=Li(e,r),t===2&&(o=Fo(e),o!==0&&(r=o,t=Jl(e,o))),t===1))throw n=fr,$t(e,0),Et(e,r),xe(e,b()),n;switch(e.finishedWork=i,e.finishedLanes=r,t){case 0:case 1:throw Error(w(345));case 2:Bt(e,_e,it);break;case 3:if(Et(e,r),(r&130023424)===r&&(t=Yl+500-b(),10<t)){if($r(e,0)!==0)break;if(i=e.suspendedLanes,(i&r)!==r){me(),e.pingedLanes|=e.suspendedLanes&i;break}e.timeoutHandle=ol(Bt.bind(null,e,_e,it),t);break}Bt(e,_e,it);break;case 4:if(Et(e,r),(r&4194240)===r)break;for(t=e.eventTimes,i=-1;0<r;){var l=31-Re(r);o=1<<l,l=t[l],l>i&&(i=l),r&=~o}if(r=i,r=b()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*bp(r/1960))-r,10<r){e.timeoutHandle=ol(Bt.bind(null,e,_e,it),r);break}Bt(e,_e,it);break;case 5:Bt(e,_e,it);break;default:throw Error(w(329))}}}return xe(e,b()),e.callbackNode===n?Ac.bind(null,e):null}function Jl(e,t){var n=dr;return e.current.memoizedState.isDehydrated&&($t(e,t).flags|=256),e=Li(e,t),e!==2&&(t=_e,_e=n,t!==null&&eu(t)),e}function eu(e){_e===null?_e=e:_e.push.apply(_e,e)}function Gp(e){for(var t=e;;){if(t.flags&16384){var n=t.updateQueue;if(n!==null&&(n=n.stores,n!==null))for(var r=0;r<n.length;r++){var i=n[r],o=i.getSnapshot;i=i.value;try{if(!ze(o(),i))return!1}catch{return!1}}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function Et(e,t){for(t&=~Gl,t&=~Pi,e.suspendedLanes|=t,e.pingedLanes&=~t,e=e.expirationTimes;0<t;){var n=31-Re(t),r=1<<n;e[n]=-1,t&=~r}}function Uc(e){if(L&6)throw Error(w(327));Sn();var t=$r(e,0);if(!(t&1))return xe(e,b()),null;var n=Li(e,t);if(e.tag!==0&&n===2){var r=Fo(e);r!==0&&(t=r,n=Jl(e,r))}if(n===1)throw n=fr,$t(e,0),Et(e,t),xe(e,b()),n;if(n===6)throw Error(w(345));return e.finishedWork=e.current.alternate,e.finishedLanes=t,Bt(e,_e,it),xe(e,b()),null}function tu(e,t){var n=L;L|=1;try{return e(t)}finally{L=n,L===0&&(wn=b()+500,li&&gt())}}function Qt(e){Ct!==null&&Ct.tag===0&&!(L&6)&&Sn();var t=L;L|=1;var n=Te.transition,r=j;try{if(Te.transition=null,j=1,e)return e()}finally{j=r,Te.transition=n,L=t,!(L&6)&&gt()}}function nu(){Pe=xn.current,U(xn)}function $t(e,t){e.finishedWork=null,e.finishedLanes=0;var n=e.timeoutHandle;if(n!==-1&&(e.timeoutHandle=-1,Ep(n)),G!==null)for(n=G.return;n!==null;){var r=n;switch(fl(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&ii();break;case 3:yn(),U(ve),U(ue),Ml();break;case 5:kl(r);break;case 4:yn();break;case 13:U(V);break;case 19:U(V);break;case 10:yl(r.type._context);break;case 22:case 23:nu()}n=n.return}if(te=e,G=e=Mt(e.current,null),ie=Pe=t,Z=0,fr=null,Gl=Pi=Ut=0,_e=dr=null,Rt!==null){for(t=0;t<Rt.length;t++)if(n=Rt[t],r=n.interleaved,r!==null){n.interleaved=null;var i=r.next,o=n.pending;if(o!==null){var l=o.next;o.next=i,r.next=l}n.pending=r}Rt=null}return e}function Qc(e,t){do{var n=G;try{if(vl(),yi.current=wi,gi){for(var r=W.memoizedState;r!==null;){var i=r.queue;i!==null&&(i.pending=null),r=r.next}gi=!1}if(At=0,ee=X=W=null,or=!1,lr=0,bl.current=null,n===null||n.return===null){Z=1,fr=t,G=null;break}e:{var o=e,l=n.return,u=n,s=t;if(t=ie,u.flags|=32768,s!==null&&typeof s=="object"&&typeof s.then=="function"){var a=s,m=u,h=m.tag;if(!(m.mode&1)&&(h===0||h===11||h===15)){var p=m.alternate;p?(m.updateQueue=p.updateQueue,m.memoizedState=p.memoizedState,m.lanes=p.lanes):(m.updateQueue=null,m.memoizedState=null)}var v=fc(l);if(v!==null){v.flags&=-257,dc(v,l,u,o,t),v.mode&1&&cc(o,a,t),t=v,s=a;var y=t.updateQueue;if(y===null){var _=new Set;_.add(s),t.updateQueue=_}else y.add(s);break e}else{if(!(t&1)){cc(o,a,t),ru();break e}s=Error(w(426))}}else if($&&u.mode&1){var O=fc(l);if(O!==null){!(O.flags&65536)&&(O.flags|=256),dc(O,l,u,o,t),hl(gn(s,u));break e}}o=s=gn(s,u),Z!==4&&(Z=2),dr===null?dr=[o]:dr.push(o),o=l;do{switch(o.tag){case 3:o.flags|=65536,t&=-t,o.lanes|=t;var d=sc(o,s,t);Da(o,d);break e;case 1:u=s;var c=o.type,f=o.stateNode;if(!(o.flags&128)&&(typeof c.getDerivedStateFromError=="function"||f!==null&&typeof f.componentDidCatch=="function"&&(St===null||!St.has(f)))){o.flags|=65536,t&=-t,o.lanes|=t;var x=ac(o,u,t);Da(o,x);break e}}o=o.return}while(o!==null)}Vc(n)}catch(C){t=C,G===n&&n!==null&&(G=n=n.return);continue}break}while(!0)}function $c(){var e=Mi.current;return Mi.current=wi,e===null?wi:e}function ru(){(Z===0||Z===3||Z===2)&&(Z=4),te===null||!(Ut&268435455)&&!(Pi&268435455)||Et(te,ie)}function Li(e,t){var n=L;L|=2;var r=$c();(te!==e||ie!==t)&&(it=null,$t(e,t));do try{Yp();break}catch(i){Qc(e,i)}while(!0);if(vl(),L=n,Mi.current=r,G!==null)throw Error(w(261));return te=null,ie=0,Z}function Yp(){for(;G!==null;)Bc(G)}function Xp(){for(;G!==null&&!Sd();)Bc(G)}function Bc(e){var t=Kc(e.alternate,e,Pe);e.memoizedProps=e.pendingProps,t===null?Vc(e):G=t,bl.current=null}function Vc(e){var t=e;do{var n=t.alternate;if(e=t.return,t.flags&32768){if(n=Wp(n,t),n!==null){n.flags&=32767,G=n;return}if(e!==null)e.flags|=32768,e.subtreeFlags=0,e.deletions=null;else{Z=6,G=null;return}}else if(n=Vp(n,t,Pe),n!==null){G=n;return}if(t=t.sibling,t!==null){G=t;return}G=t=e}while(t!==null);Z===0&&(Z=5)}function Bt(e,t,n){var r=j,i=Te.transition;try{Te.transition=null,j=1,Zp(e,t,n,r)}finally{Te.transition=i,j=r}return null}function Zp(e,t,n,r){do Sn();while(Ct!==null);if(L&6)throw Error(w(327));n=e.finishedWork;var i=e.finishedLanes;if(n===null)return null;if(e.finishedWork=null,e.finishedLanes=0,n===e.current)throw Error(w(177));e.callbackNode=null,e.callbackPriority=0;var o=n.lanes|n.childLanes;if(Fd(e,o),e===te&&(G=te=null,ie=0),!(n.subtreeFlags&2064)&&!(n.flags&2064)||Ii||(Ii=!0,qc(zr,function(){return Sn(),null})),o=(n.flags&15990)!==0,n.subtreeFlags&15990||o){o=Te.transition,Te.transition=null;var l=j;j=1;var u=L;L|=4,bl.current=null,Kp(e,n),Lc(n,e),gp(rl),Wr=!!nl,rl=nl=null,e.current=n,qp(n),Cd(),L=u,j=l,Te.transition=o}else e.current=n;if(Ii&&(Ii=!1,Ct=e,Oi=i),o=e.pendingLanes,o===0&&(St=null),Md(n.stateNode),xe(e,b()),t!==null)for(r=e.onRecoverableError,n=0;n<t.length;n++)i=t[n],r(i.value,{componentStack:i.stack,digest:i.digest});if(Ni)throw Ni=!1,e=Xl,Xl=null,e;return Oi&1&&e.tag!==0&&Sn(),o=e.pendingLanes,o&1?e===Zl?pr++:(pr=0,Zl=e):pr=0,gt(),null}function Sn(){if(Ct!==null){var e=Os(Oi),t=Te.transition,n=j;try{if(Te.transition=null,j=16>e?16:e,Ct===null)var r=!1;else{if(e=Ct,Ct=null,Oi=0,L&6)throw Error(w(331));var i=L;for(L|=4,E=e.current;E!==null;){var o=E,l=o.child;if(E.flags&16){var u=o.deletions;if(u!==null){for(var s=0;s<u.length;s++){var a=u[s];for(E=a;E!==null;){var m=E;switch(m.tag){case 0:case 11:case 15:cr(8,m,o)}var h=m.child;if(h!==null)h.return=m,E=h;else for(;E!==null;){m=E;var p=m.sibling,v=m.return;if(Nc(m),m===a){E=null;break}if(p!==null){p.return=v,E=p;break}E=v}}}var y=o.alternate;if(y!==null){var _=y.child;if(_!==null){y.child=null;do{var O=_.sibling;_.sibling=null,_=O}while(_!==null)}}E=o}}if(o.subtreeFlags&2064&&l!==null)l.return=o,E=l;else e:for(;E!==null;){if(o=E,o.flags&2048)switch(o.tag){case 0:case 11:case 15:cr(9,o,o.return)}var d=o.sibling;if(d!==null){d.return=o.return,E=d;break e}E=o.return}}var c=e.current;for(E=c;E!==null;){l=E;var f=l.child;if(l.subtreeFlags&2064&&f!==null)f.return=l,E=f;else e:for(l=c;E!==null;){if(u=E,u.flags&2048)try{switch(u.tag){case 0:case 11:case 15:Ei(9,u)}}catch(C){K(u,u.return,C)}if(u===l){E=null;break e}var x=u.sibling;if(x!==null){x.return=u.return,E=x;break e}E=u.return}}if(L=i,gt(),We&&typeof We.onPostCommitFiberRoot=="function")try{We.onPostCommitFiberRoot(Ar,e)}catch{}r=!0}return r}finally{j=n,Te.transition=t}}return!1}function Wc(e,t,n){t=gn(n,t),t=sc(e,t,1),e=xt(e,t,1),t=me(),e!==null&&(zn(e,1,t),xe(e,t))}function K(e,t,n){if(e.tag===3)Wc(e,e,n);else for(;t!==null;){if(t.tag===3){Wc(t,e,n);break}else if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(St===null||!St.has(r))){e=gn(n,e),e=ac(t,e,1),t=xt(t,e,1),e=me(),t!==null&&(zn(t,1,e),xe(t,e));break}}t=t.return}}function Jp(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),t=me(),e.pingedLanes|=e.suspendedLanes&n,te===e&&(ie&n)===n&&(Z===4||Z===3&&(ie&130023424)===ie&&500>b()-Yl?$t(e,0):Gl|=n),xe(e,t)}function Hc(e,t){t===0&&(e.mode&1?(t=Qr,Qr<<=1,!(Qr&130023424)&&(Qr=4194304)):t=1);var n=me();e=tt(e,t),e!==null&&(zn(e,t,n),xe(e,n))}function eh(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),Hc(e,n)}function th(e,t){var n=0;switch(e.tag){case 13:var r=e.stateNode,i=e.memoizedState;i!==null&&(n=i.retryLane);break;case 19:r=e.stateNode;break;default:throw Error(w(314))}r!==null&&r.delete(t),Hc(e,n)}var Kc;Kc=function(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps||ve.current)ge=!0;else{if(!(e.lanes&n)&&!(t.flags&128))return ge=!1,Bp(e,t,n);ge=!!(e.flags&131072)}else ge=!1,$&&t.flags&1048576&&ka(t,si,t.index);switch(t.lanes=0,t.tag){case 2:var r=t.type;Ci(e,t),e=t.pendingProps;var i=cn(t,ue.current);mn(t,n),i=Il(null,t,r,e,i,n);var o=Ol();return t.flags|=1,typeof i=="object"&&i!==null&&typeof i.render=="function"&&i.$$typeof===void 0?(t.tag=1,t.memoizedState=null,t.updateQueue=null,ye(r)?(o=!0,oi(t)):o=!1,t.memoizedState=i.state!==null&&i.state!==void 0?i.state:null,xl(t),i.updater=hi,t.stateNode=i,i._reactInternals=t,Sl(t,r,e,n),t=Al(null,t,r,!0,o,n)):(t.tag=0,$&&o&&cl(t),he(null,t,i,n),t=t.child),t;case 16:r=t.elementType;e:{switch(Ci(e,t),e=t.pendingProps,i=r._init,r=i(r._payload),t.type=r,i=t.tag=rh(r),e=Ue(r,e),i){case 0:t=zl(null,t,r,e,n);break e;case 1:t=gc(null,t,r,e,n);break e;case 11:t=pc(null,t,r,e,n);break e;case 14:t=hc(null,t,r,Ue(r.type,e),n);break e}throw Error(w(306,r,""))}return t;case 0:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:Ue(r,i),zl(e,t,r,i,n);case 1:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:Ue(r,i),gc(e,t,r,i,n);case 3:e:{if(_c(t),e===null)throw Error(w(387));r=t.pendingProps,o=t.memoizedState,i=o.element,Oa(e,t),pi(t,r,null,n);var l=t.memoizedState;if(r=l.element,o.isDehydrated)if(o={element:r,isDehydrated:!1,cache:l.cache,pendingSuspenseBoundaries:l.pendingSuspenseBoundaries,transitions:l.transitions},t.updateQueue.baseState=o,t.memoizedState=o,t.flags&256){i=gn(Error(w(423)),t),t=xc(e,t,r,n,i);break e}else if(r!==i){i=gn(Error(w(424)),t),t=xc(e,t,r,n,i);break e}else for(Me=mt(t.stateNode.containerInfo.firstChild),Ee=t,$=!0,Ae=null,n=Ua(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling;else{if(pn(),r===i){t=rt(e,t,n);break e}he(e,t,r,n)}t=t.child}return t;case 5:return Qa(t),e===null&&pl(t),r=t.type,i=t.pendingProps,o=e!==null?e.memoizedProps:null,l=i.children,il(r,i)?l=null:o!==null&&il(r,o)&&(t.flags|=32),yc(e,t),he(e,t,l,n),t.child;case 6:return e===null&&pl(t),null;case 13:return wc(e,t,n);case 4:return Cl(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=vn(t,null,r,n):he(e,t,r,n),t.child;case 11:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:Ue(r,i),pc(e,t,r,i,n);case 7:return he(e,t,t.pendingProps,n),t.child;case 8:return he(e,t,t.pendingProps.children,n),t.child;case 12:return he(e,t,t.pendingProps.children,n),t.child;case 10:e:{if(r=t.type._context,i=t.pendingProps,o=t.memoizedProps,l=i.value,R(ci,r._currentValue),r._currentValue=l,o!==null)if(ze(o.value,l)){if(o.children===i.children&&!ve.current){t=rt(e,t,n);break e}}else for(o=t.child,o!==null&&(o.return=t);o!==null;){var u=o.dependencies;if(u!==null){l=o.child;for(var s=u.firstContext;s!==null;){if(s.context===r){if(o.tag===1){s=nt(-1,n&-n),s.tag=2;var a=o.updateQueue;if(a!==null){a=a.shared;var m=a.pending;m===null?s.next=s:(s.next=m.next,m.next=s),a.pending=s}}o.lanes|=n,s=o.alternate,s!==null&&(s.lanes|=n),gl(o.return,n,t),u.lanes|=n;break}s=s.next}}else if(o.tag===10)l=o.type===t.type?null:o.child;else if(o.tag===18){if(l=o.return,l===null)throw Error(w(341));l.lanes|=n,u=l.alternate,u!==null&&(u.lanes|=n),gl(l,n,t),l=o.sibling}else l=o.child;if(l!==null)l.return=o;else for(l=o;l!==null;){if(l===t){l=null;break}if(o=l.sibling,o!==null){o.return=l.return,l=o;break}l=l.return}o=l}he(e,t,i.children,n),t=t.child}return t;case 9:return i=t.type,r=t.pendingProps.children,mn(t,n),i=Fe(i),r=r(i),t.flags|=1,he(e,t,r,n),t.child;case 14:return r=t.type,i=Ue(r,t.pendingProps),i=Ue(r.type,i),hc(e,t,r,i,n);case 15:return mc(e,t,t.type,t.pendingProps,n);case 17:return r=t.type,i=t.pendingProps,i=t.elementType===r?i:Ue(r,i),Ci(e,t),t.tag=1,ye(r)?(e=!0,oi(t)):e=!1,mn(t,n),ja(t,r,i),Sl(t,r,i,n),Al(null,t,r,!0,e,n);case 19:return Cc(e,t,n);case 22:return vc(e,t,n)}throw Error(w(156,t.tag))};function qc(e,t){return Es(e,t)}function nh(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function je(e,t,n,r){return new nh(e,t,n,r)}function iu(e){return e=e.prototype,!(!e||!e.isReactComponent)}function rh(e){if(typeof e=="function")return iu(e)?1:0;if(e!=null){if(e=e.$$typeof,e===ao)return 11;if(e===po)return 14}return 2}function Mt(e,t){var n=e.alternate;return n===null?(n=je(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&14680064,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n}function Ti(e,t,n,r,i,o){var l=2;if(r=e,typeof e=="function")iu(e)&&(l=1);else if(typeof e=="string")l=5;else e:switch(e){case Yt:return Vt(n.children,i,o,t);case uo:l=8,i|=8;break;case so:return e=je(12,n,t,i|2),e.elementType=so,e.lanes=o,e;case co:return e=je(13,n,t,i),e.elementType=co,e.lanes=o,e;case fo:return e=je(19,n,t,i),e.elementType=fo,e.lanes=o,e;case ts:return ji(n,i,o,t);default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case Ju:l=10;break e;case es:l=9;break e;case ao:l=11;break e;case po:l=14;break e;case ut:l=16,r=null;break e}throw Error(w(130,e==null?e:typeof e,""))}return t=je(l,n,t,i),t.elementType=e,t.type=r,t.lanes=o,t}function Vt(e,t,n,r){return e=je(7,e,r,t),e.lanes=n,e}function ji(e,t,n,r){return e=je(22,e,r,t),e.elementType=ts,e.lanes=n,e.stateNode={isHidden:!1},e}function ou(e,t,n){return e=je(6,e,null,t),e.lanes=n,e}function lu(e,t,n){return t=je(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}function ih(e,t,n,r,i){this.tag=t,this.containerInfo=e,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=Lo(0),this.expirationTimes=Lo(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Lo(0),this.identifierPrefix=r,this.onRecoverableError=i,this.mutableSourceEagerHydrationData=null}function uu(e,t,n,r,i,o,l,u,s){return e=new ih(e,t,n,u,s),t===1?(t=1,o===!0&&(t|=8)):t=0,o=je(3,null,null,t),e.current=o,o.stateNode=e,o.memoizedState={element:r,isDehydrated:n,cache:null,transitions:null,pendingSuspenseBoundaries:null},xl(o),e}function oh(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:Gt,key:r==null?null:""+r,children:e,containerInfo:t,implementation:n}}function bc(e){if(!e)return yt;e=e._reactInternals;e:{if(Dt(e)!==e||e.tag!==1)throw Error(w(170));var t=e;do{switch(t.tag){case 3:t=t.stateNode.context;break e;case 1:if(ye(t.type)){t=t.stateNode.__reactInternalMemoizedMergedChildContext;break e}}t=t.return}while(t!==null);throw Error(w(171))}if(e.tag===1){var n=e.type;if(ye(n))return wa(e,n,t)}return t}function Gc(e,t,n,r,i,o,l,u,s){return e=uu(n,r,!0,e,i,o,l,u,s),e.context=bc(null),n=e.current,r=me(),i=kt(n),o=nt(r,i),o.callback=t??null,xt(n,o,i),e.current.lanes=i,zn(e,i,r),xe(e,r),e}function Ri(e,t,n,r){var i=t.current,o=me(),l=kt(i);return n=bc(n),t.context===null?t.context=n:t.pendingContext=n,t=nt(o,l),t.payload={element:e},r=r===void 0?null:r,r!==null&&(t.callback=r),e=xt(i,t,l),e!==null&&(Be(e,i,l,o),di(e,i,l)),l}function zi(e){if(e=e.current,!e.child)return null;switch(e.child.tag){case 5:return e.child.stateNode;default:return e.child.stateNode}}function Yc(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function su(e,t){Yc(e,t),(e=e.alternate)&&Yc(e,t)}function lh(){return null}var Xc=typeof reportError=="function"?reportError:function(e){console.error(e)};function au(e){this._internalRoot=e}Ai.prototype.render=au.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(w(409));Ri(e,t,null,null)},Ai.prototype.unmount=au.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;Qt(function(){Ri(null,e,null,null)}),t[Xe]=null}};function Ai(e){this._internalRoot=e}Ai.prototype.unstable_scheduleHydration=function(e){if(e){var t=Ls();e={blockedOn:null,target:e,priority:t};for(var n=0;n<dt.length&&t!==0&&t<dt[n].priority;n++);dt.splice(n,0,e),n===0&&Rs(e)}};function cu(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function Ui(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11&&(e.nodeType!==8||e.nodeValue!==" react-mount-point-unstable "))}function Zc(){}function uh(e,t,n,r,i){if(i){if(typeof r=="function"){var o=r;r=function(){var a=zi(l);o.call(a)}}var l=Gc(t,r,e,0,null,!1,!1,"",Zc);return e._reactRootContainer=l,e[Xe]=l.current,Xn(e.nodeType===8?e.parentNode:e),Qt(),l}for(;i=e.lastChild;)e.removeChild(i);if(typeof r=="function"){var u=r;r=function(){var a=zi(s);u.call(a)}}var s=uu(e,0,!1,null,null,!1,!1,"",Zc);return e._reactRootContainer=s,e[Xe]=s.current,Xn(e.nodeType===8?e.parentNode:e),Qt(function(){Ri(t,s,n,r)}),s}function Qi(e,t,n,r,i){var o=n._reactRootContainer;if(o){var l=o;if(typeof i=="function"){var u=i;i=function(){var s=zi(l);u.call(s)}}Ri(t,l,e,i)}else l=uh(n,t,e,i,r);return zi(l)}Ds=function(e){switch(e.tag){case 3:var t=e.stateNode;if(t.current.memoizedState.isDehydrated){var n=Rn(t.pendingLanes);n!==0&&(To(t,n|1),xe(t,b()),!(L&6)&&(wn=b()+500,gt()))}break;case 13:Qt(function(){var r=tt(e,1);if(r!==null){var i=me();Be(r,e,1,i)}}),su(e,1)}},jo=function(e){if(e.tag===13){var t=tt(e,134217728);if(t!==null){var n=me();Be(t,e,134217728,n)}su(e,134217728)}},Fs=function(e){if(e.tag===13){var t=kt(e),n=tt(e,t);if(n!==null){var r=me();Be(n,e,t,r)}su(e,t)}},Ls=function(){return j},Ts=function(e,t){var n=j;try{return j=e,t()}finally{j=n}},Po=function(e,t,n){switch(t){case"input":if(_o(e,n),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll("input[name="+JSON.stringify(""+t)+'][type="radio"]'),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var i=ri(r);if(!i)throw Error(w(90));is(r),_o(r,i)}}}break;case"textarea":as(e,n);break;case"select":t=n.value,t!=null&&Xt(e,!!n.multiple,t,!1)}},gs=tu,_s=Qt;var sh={usingClientEntryPoint:!1,Events:[er,sn,ri,vs,ys,tu]},hr={findFiberByHostInstance:Ft,bundleType:0,version:"18.2.0",rendererPackageName:"react-dom"},ah={bundleType:hr.bundleType,version:hr.version,rendererPackageName:hr.rendererPackageName,rendererConfig:hr.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:Ye.ReactCurrentDispatcher,findHostInstanceByFiber:function(e){return e=Cs(e),e===null?null:e.stateNode},findFiberByHostInstance:hr.findFiberByHostInstance||lh,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.2.0-next-9e3b772b8-20220608"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var $i=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!$i.isDisabled&&$i.supportsFiber)try{Ar=$i.inject(ah),We=$i}catch{}}Se.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=sh,Se.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!cu(t))throw Error(w(200));return oh(e,t,null,n)},Se.createRoot=function(e,t){if(!cu(e))throw Error(w(299));var n=!1,r="",i=Xc;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onRecoverableError!==void 0&&(i=t.onRecoverableError)),t=uu(e,1,!1,null,null,n,!1,r,i),e[Xe]=t.current,Xn(e.nodeType===8?e.parentNode:e),new au(t)},Se.findDOMNode=function(e){if(e==null)return null;if(e.nodeType===1)return e;var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(w(188)):(e=Object.keys(e).join(","),Error(w(268,e)));return e=Cs(t),e=e===null?null:e.stateNode,e},Se.flushSync=function(e){return Qt(e)},Se.hydrate=function(e,t,n){if(!Ui(t))throw Error(w(200));return Qi(null,e,t,!0,n)},Se.hydrateRoot=function(e,t,n){if(!cu(e))throw Error(w(405));var r=n!=null&&n.hydratedSources||null,i=!1,o="",l=Xc;if(n!=null&&(n.unstable_strictMode===!0&&(i=!0),n.identifierPrefix!==void 0&&(o=n.identifierPrefix),n.onRecoverableError!==void 0&&(l=n.onRecoverableError)),t=Gc(t,null,e,1,n??null,i,!1,o,l),e[Xe]=t.current,Xn(e),r)for(e=0;e<r.length;e++)n=r[e],i=n._getVersion,i=i(n._source),t.mutableSourceEagerHydrationData==null?t.mutableSourceEagerHydrationData=[n,i]:t.mutableSourceEagerHydrationData.push(n,i);return new Ai(t)},Se.render=function(e,t,n){if(!Ui(t))throw Error(w(200));return Qi(null,e,t,!1,n)},Se.unmountComponentAtNode=function(e){if(!Ui(e))throw Error(w(40));return e._reactRootContainer?(Qt(function(){Qi(null,null,e,!1,function(){e._reactRootContainer=null,e[Xe]=null})}),!0):!1},Se.unstable_batchedUpdates=tu,Se.unstable_renderSubtreeIntoContainer=function(e,t,n,r){if(!Ui(n))throw Error(w(200));if(e==null||e._reactInternals===void 0)throw Error(w(38));return Qi(e,t,n,!1,r)},Se.version="18.2.0-next-9e3b772b8-20220608";function Jc(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(Jc)}catch(e){console.error(e)}}Jc(),Ku.exports=Se;var ef=Ku.exports,ch=_u(ef).unstable_batchedUpdates;H.setBatchNotifyFunction(ch);var fh=console;Gf(fh);var tf=oe.createContext(void 0),nf=oe.createContext(!1);function rf(e){return e&&typeof window<"u"?(window.ReactQueryClientContext||(window.ReactQueryClientContext=tf),window.ReactQueryClientContext):tf}var dh=function(){var t=oe.useContext(rf(oe.useContext(nf)));if(!t)throw new Error("No QueryClient set, use QueryClientProvider to set one");return t},ph=function(t){var n=t.client,r=t.contextSharing,i=r===void 0?!1:r,o=t.children;oe.useEffect(function(){return n.mount(),function(){n.unmount()}},[n]);var l=rf(i);return oe.createElement(nf.Provider,{value:i},oe.createElement(l.Provider,{value:n},o))};function hh(){var e=!1;return{clearReset:function(){e=!1},reset:function(){e=!0},isReset:function(){return e}}}var mh=oe.createContext(hh()),vh=function(){return oe.useContext(mh)};function yh(e,t,n){return typeof t=="function"?t.apply(void 0,n):typeof t=="boolean"?t:!!e}function gh(e,t){var n=oe.useRef(!1),r=oe.useState(0),i=r[1],o=dh(),l=vh(),u=o.defaultQueryObserverOptions(e);u.optimisticResults=!0,u.onError&&(u.onError=H.batchCalls(u.onError)),u.onSuccess&&(u.onSuccess=H.batchCalls(u.onSuccess)),u.onSettled&&(u.onSettled=H.batchCalls(u.onSettled)),u.suspense&&(typeof u.staleTime!="number"&&(u.staleTime=1e3),u.cacheTime===0&&(u.cacheTime=1)),(u.suspense||u.useErrorBoundary)&&(l.isReset()||(u.retryOnMount=!1));var s=oe.useState(function(){return new t(o,u)}),a=s[0],m=a.getOptimisticResult(u);if(oe.useEffect(function(){n.current=!0,l.clearReset();var h=a.subscribe(H.batchCalls(function(){n.current&&i(function(p){return p+1})}));return a.updateResult(),function(){n.current=!1,h()}},[l,a]),oe.useEffect(function(){a.setOptions(u,{listeners:!1})},[u,a]),u.suspense&&m.isLoading)throw a.fetchOptimistic(u).then(function(h){var p=h.data;u.onSuccess==null||u.onSuccess(p),u.onSettled==null||u.onSettled(p,null)}).catch(function(h){l.clearReset(),u.onError==null||u.onError(h),u.onSettled==null||u.onSettled(void 0,h)});if(m.isError&&!l.isReset()&&!m.isFetching&&yh(u.suspense,u.useErrorBoundary,[m.error,a.getCurrentQuery()]))throw m.error;return u.notifyOnChangeProps==="tracked"&&(m=a.trackResult(m,u)),m}function _h(e,t,n){var r=Cr(e,t,n);return gh(r,od)}var fu=(e=>(e.OUTLET="outlet",e.BRAND="brand",e))(fu||{});const xh={idType:fu.OUTLET,brandId:"",menuItemHighlightText:"Our recommendation",smartChefUrl:""},mr=J.createContext(xh);var of=(e=>(e.VIEW_MENU="View-only Menus",e))(of||{}),lf=(e=>(e.PAGE_VIEW="pageView",e))(lf||{}),du=(e=>(e.LOGGED_OUT="Logged-out",e.LOGGED_IN="Logged-in",e))(du||{}),pu=(e=>(e.HARD="Hard Brand",e.SOFT="Soft Brand",e))(pu||{}),hu=(e=>(e.OUTLET="Outlet Page",e.BRAND="Brand Page",e))(hu||{});const wh=e=>("; "+document.cookie).split("; "+e+"=").length===2,Sh=(e,t)=>{const n=window.dataLayer!==void 0;window.dataLayer=window.dataLayer||[],n||console.warn("Could not find dataLayer object on window. Using an empty array");const r={event:e,...t};window.dataLayer.push(r)},Ch=()=>{var e,t;return(t=(e=window==null?void 0:window.Estate)==null?void 0:e.MarketingBrand)!=null&&t.IsHardBrand?pu.HARD:pu.SOFT},kh=()=>{var e,t;return((t=(e=window==null?void 0:window.Estate)==null?void 0:e.Outlet)==null?void 0:t.Name)??"undefined"},Eh=()=>{var e,t;return((t=(e=window==null?void 0:window.Estate)==null?void 0:e.Outlet)==null?void 0:t.BunCode)??"undefined"},uf=720,Mh=920,Ph=()=>{const[e,t]=J.useState(window.innerWidth),n=()=>{t(window.innerWidth)};J.useEffect(()=>(window.addEventListener("resize",n),()=>{window.removeEventListener("resize",n)}),[]);const r=e<=uf,i=e>uf,o=e>Mh;return{isMobile:r,isTablet:i,isDesktop:o}},sf=(e,t)=>{var i,o;const n=!e&&((i=t[0])!=null&&i.nutrition)?(o=t[0].nutrition)==null?void 0:o.energyKcalPerPortion:null;return{energyKcalPerPortion:n,withNutrition:!!(n&&!e)}},q=({font:e="primary",as:t="span",className:n,children:r,...i})=>{const o=t||"span";return g.jsx(o,{...i,className:`Text Text__${e} ${n||""}`,children:r})},vr=({variant:e,size:t="small","data-testid":n})=>{const r=e==="vegan",i=e==="vegetarian",o=e==="glutenFree";return i?g.jsx("div",{className:"DietaryIcon__box",children:g.jsx(q,{font:"secondary",className:`DietaryIcon__icon DietaryIcon__icon-${t} DietaryIcon__vegetarian`,"aria-label":"Vegetarian","data-testid":n||"Vegetarian",children:"v"})}):r?g.jsx("div",{className:"DietaryIcon__box",children:g.jsx(q,{font:"secondary",className:`DietaryIcon__icon DietaryIcon__icon-${t} DietaryIcon__vegan`,"aria-label":"Vegan","data-testid":n||"Vegan",children:"ve"})}):o?g.jsx("div",{className:"DietaryIcon__box",children:g.jsx(q,{font:"secondary",className:`DietaryIcon__icon DietaryIcon__icon-${t} DietaryIcon__gluten-free`,"aria-label":"Gluten free","data-testid":n||"GlutenFree",children:"gf"})}):null},af=e=>g.jsx("svg",{fill:"none",xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 10 10.02",...e,children:g.jsx("path",{d:"M5 7.51981C5.14167 7.51981 5.2605 7.47169 5.3565 7.37547C5.45217 7.27957 5.5 7.16062 5.5 7.01862V5.00133C5.5 4.85932 5.45217 4.74238 5.3565 4.65049C5.2605 4.55861 5.14167 4.51267 5 4.51267C4.85833 4.51267 4.73967 4.56061 4.644 4.65651C4.548 4.75274 4.5 4.87185 4.5 5.01386V7.03115C4.5 7.17315 4.548 7.2901 4.644 7.38198C4.73967 7.47387 4.85833 7.51981 5 7.51981ZM5 3.51029C5.14167 3.51029 5.2605 3.46217 5.3565 3.36594C5.45217 3.27005 5.5 3.1511 5.5 3.0091C5.5 2.86709 5.45217 2.74798 5.3565 2.65175C5.2605 2.55585 5.14167 2.50791 5 2.50791C4.85833 2.50791 4.73967 2.55585 4.644 2.65175C4.548 2.74798 4.5 2.86709 4.5 3.0091C4.5 3.1511 4.548 3.27005 4.644 3.36594C4.73967 3.46217 4.85833 3.51029 5 3.51029ZM5 10.0258C4.30833 10.0258 3.65833 9.89412 3.05 9.63082C2.44167 9.36787 1.9125 9.01085 1.4625 8.55978C1.0125 8.10871 0.656333 7.57828 0.394 6.9685C0.131333 6.35872 0 5.70717 0 5.01386C0 4.32054 0.131333 3.669 0.394 3.05921C0.656333 2.44943 1.0125 1.91901 1.4625 1.46794C1.9125 1.01686 2.44167 0.659682 3.05 0.39639C3.65833 0.133432 4.30833 0.00195312 5 0.00195312C5.69167 0.00195312 6.34167 0.133432 6.95 0.39639C7.55833 0.659682 8.0875 1.01686 8.5375 1.46794C8.9875 1.91901 9.34367 2.44943 9.606 3.05921C9.86867 3.669 10 4.32054 10 5.01386C10 5.70717 9.86867 6.35872 9.606 6.9685C9.34367 7.57828 8.9875 8.10871 8.5375 8.55978C8.0875 9.01085 7.55833 9.36787 6.95 9.63082C6.34167 9.89412 5.69167 10.0258 5 10.0258ZM5 9.02338C6.10833 9.02338 7.05217 8.63295 7.8315 7.8521C8.6105 7.07091 9 6.12483 9 5.01386C9 3.90289 8.6105 2.9568 7.8315 2.17562C7.05217 1.39476 6.10833 1.00433 5 1.00433C3.89167 1.00433 2.948 1.39476 2.169 2.17562C1.38967 2.9568 1 3.90289 1 5.01386C1 6.12483 1.38967 7.07091 2.169 7.8521C2.948 8.63295 3.89167 9.02338 5 9.02338Z",fill:"currentColor"})}),Nh=e=>g.jsx("svg",{xmlns:"http://www.w3.org/2000/svg",width:"15",height:"14",viewBox:"0 0 15 14",fill:"none","aria-hidden":"true","data-testid":"Featured-Icon",...e,children:g.jsx("path",{d:"M5.06677 14L3.80008 11.8667L1.40003 11.3333L1.63337 8.86667L0 7L1.63337 5.13333L1.40003 2.66667L3.80008 2.13333L5.06677 0L7.33349 0.966667L9.6002 0L10.8669 2.13333L13.2669 2.66667L13.0336 5.13333L14.667 7L13.0336 8.86667L13.2669 11.3333L10.8669 11.8667L9.6002 14L7.33349 13.0333L5.06677 14ZM5.63345 12.3L7.33349 11.5667L9.06686 12.3L10.0002 10.7L11.8336 10.2667L11.6669 8.4L12.9003 7L11.6669 5.56667L11.8336 3.7L10.0002 3.3L9.03352 1.7L7.33349 2.43333L5.60012 1.7L4.66677 3.3L2.83339 3.7L3.00006 5.56667L1.7667 7L3.00006 8.4L2.83339 10.3L4.66677 10.7L5.63345 12.3ZM6.63347 9.36667L10.4002 5.6L9.46687 4.63333L6.63347 7.46667L5.20011 6.06667L4.26676 7L6.63347 9.36667Z",fill:"black"})}),Ih=e=>g.jsxs("svg",{width:"24",height:"24",viewBox:"0 0 24 24",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:[g.jsxs("g",{clipPath:"url(#clip0_5392_11122)",children:[g.jsx("mask",{id:"mask0_5392_11122",style:{maskType:"alpha"},maskUnits:"userSpaceOnUse",x:"0",y:"0",width:"24",height:"24",children:g.jsx("rect",{width:"24",height:"24",fill:"#D9D9D9"})}),g.jsx("g",{mask:"url(#mask0_5392_11122)",children:g.jsx("path",{d:"M12.0008 13.3998L7.10078 18.2998C6.91745 18.4831 6.68411 18.5748 6.40078 18.5748C6.11745 18.5748 5.88411 18.4831 5.70078 18.2998C5.51745 18.1165 5.42578 17.8831 5.42578 17.5998C5.42578 17.3165 5.51745 17.0831 5.70078 16.8998L10.6008 11.9998L5.70078 7.0998C5.51745 6.91647 5.42578 6.68314 5.42578 6.3998C5.42578 6.11647 5.51745 5.88314 5.70078 5.6998C5.88411 5.51647 6.11745 5.4248 6.40078 5.4248C6.68411 5.4248 6.91745 5.51647 7.10078 5.6998L12.0008 10.5998L16.9008 5.6998C17.0841 5.51647 17.3174 5.4248 17.6008 5.4248C17.8841 5.4248 18.1174 5.51647 18.3008 5.6998C18.4841 5.88314 18.5758 6.11647 18.5758 6.3998C18.5758 6.68314 18.4841 6.91647 18.3008 7.0998L13.4008 11.9998L18.3008 16.8998C18.4841 17.0831 18.5758 17.3165 18.5758 17.5998C18.5758 17.8831 18.4841 18.1165 18.3008 18.2998C18.1174 18.4831 17.8841 18.5748 17.6008 18.5748C17.3174 18.5748 17.0841 18.4831 16.9008 18.2998L12.0008 13.3998Z",fill:"#277191"})})]}),g.jsx("defs",{children:g.jsx("clipPath",{id:"clip0_5392_11122",children:g.jsx("rect",{width:"24",height:"24",fill:"white"})})})]}),cf=({icon:e,text:t,className:n,href:r="",target:i,variant:o="medium"})=>{const l=r?"a":"button";return g.jsxs(l,{href:r,className:`MenuActionButton__container MenuActionButton__variant__${o} ${n}`,target:i,children:[e,g.jsx(q,{font:"primary",className:`MenuActionButton__text MenuActionButton__text__${o}`,children:t})]})},Oh=()=>{const{isMobile:e}=Ph(),{smartChefUrl:t}=J.useContext(mr);return g.jsxs("div",{className:"MenuDietaryInfo__container",children:[g.jsxs("div",{className:"MenuDietaryInfo__text-container MenuDietaryInfo__text-container__dietary",children:[g.jsx(q,{font:"secondary",children:"Dietary Key: "}),g.jsxs("div",{className:"MenuDietaryInfo__text-container",children:[g.jsxs("div",{className:"MenuDietaryInfo__text-container MenuDietaryInfo__text-container__vegetarian",children:[g.jsx(vr,{variant:"vegetarian","data-testid":"PriceAndNutrition-Vegetarian"}),g.jsx(q,{font:"secondary",children:"Vegetarian"})]}),g.jsxs("div",{className:"MenuDietaryInfo__text-container MenuDietaryInfo__text-container__vegan",children:[g.jsx(vr,{variant:"vegan","data-testid":"PriceAndNutrition-Vegan"}),g.jsx(q,{font:"secondary",children:"Vegan"})]})]})]}),g.jsx(cf,{href:t,text:"Nutrition & Allergy Info",icon:g.jsx(af,{className:"MenuDietaryInfo__nutrition-icon"}),target:"_blank",variant:e?"medium":"small"})]})},Dh=({menuCopyDigitalFooter:e})=>g.jsx("section",{className:"MenuFooter__container",children:g.jsx("div",{className:"MenuFooter__wrapper",children:g.jsx(q,{as:"p",font:"secondary",className:"MenuFooter__description-text",children:e})})}),Fh=({guestFacingName:e,guestFacingDescriptionDigital:t})=>g.jsxs("header",{className:"MenuHeader__container",children:[g.jsx("div",{className:"MenuHeader__wrapper",children:g.jsx(q,{as:"h1",className:"MenuHeader__header-text",children:e})}),g.jsx(q,{font:"secondary",className:"MenuHeader__description-text",children:t})]}),ff=({abv:e,isFeaturedItem:t=!1,isInModal:n=!1,"data-testid":r})=>g.jsxs(q,{font:"secondary",className:`Abv__text${t?" Abv__featured":""} ${n?" Abv__text-modal":""}`,"data-testid":r||"Abv",children:[e,"% Vol."]}),Lh=({children:e,onCloseModal:t,modalClassName:n=""})=>{const r=J.useRef(null);return J.useEffect(()=>(document.body.classList.add("body-no-scroll"),()=>{document.body.classList.remove("body-no-scroll")}),[]),J.useEffect(()=>{const i=l=>{const u=l.target,s=r.current;if(!s)return;s.contains(u)||t()},o=l=>{l.key==="Escape"&&t()};return document.addEventListener("mousedown",i),document.addEventListener("keydown",o),()=>{document.removeEventListener("mousedown",i),document.removeEventListener("keydown",o)}},[t]),g.jsx("div",{"data-testid":"Modal-Box",className:"Modal__box",children:g.jsxs("div",{className:`Modal__modal ${n}`,"data-testid":"Modal",ref:r,children:[g.jsx("div",{className:"Modal__close-button-box",children:g.jsx(Ih,{onClick:t,className:"Modal__close-button","data-testid":"Modal-CloseButton"})}),e]})})},df=({energyKcalPerPortion:e,isFeaturedItem:t=!1,isInModal:n=!1,withComma:r=!1,"data-testid":i})=>{const o=Math.round(Number(e.replace(/,/g,""))).toLocaleString();return g.jsxs(q,{font:"secondary",className:`Nutrition__energyKcalPerPortion${t?" Nutrition__featured":""} ${n?" Nutrition__energyKcalPerPortion-modal":""}`,"data-testid":i||"Nutrition",children:[o," Kcal",r?",":""]})},pf=({isInModal:e=!1,"data-testid":t})=>{const{menuItemHighlightText:n}=J.useContext(mr);return g.jsxs("div",{className:e?"Featured__box Featured__modal":"Featured__box","data-testid":t||"Featured-Box",children:[g.jsx(q,{font:"secondary",className:e?"Featured__text-modal":"Featured__text","data-testid":"Featured-Text",children:n}),g.jsx(Nh,{className:"Featured__icon"})]})},hf=({price:e,isVegan:t=!1,isVegetarian:n=!1,isGlutenFree:r=!1,isFeaturedItem:i=!1,isInModal:o=!1,"data-testid":l})=>{const u=t||n||r,s=o?"large":"small";return g.jsxs("div",{className:"PriceAndDietaryInfo__box","data-testid":l||"PriceAndDietaryInfo-Box",children:[e&&g.jsxs(q,{font:"secondary",className:`PriceAndDietaryInfo__price${i?" PriceAndDietaryInfo__featured-price":""}`,"data-testid":"PriceAndDietaryInfo-Price",children:["£",e]}),u&&g.jsxs("div",{className:"PriceAndDietaryInfo__dietary-icons",children:[n&&g.jsx(vr,{size:s,variant:"vegetarian","data-testid":"PriceAndDietaryInfo-Vegetarian"}),t&&g.jsx(vr,{variant:"vegan","data-testid":"PriceAndDietaryInfo-Vegan",size:s}),r&&g.jsx(vr,{size:s,variant:"glutenFree","data-testid":"PriceAndDietaryInfo-GlutenFree"})]})]})},Th=({item:e})=>{const{energyKcalPerPortion:t,withNutrition:n}=sf(e.isGri,e.portions),{smartChefUrl:r}=J.useContext(mr);return g.jsxs("div",{className:"MenuItemModalContent__box","data-testid":"MenuItemModalContent-Box",children:[g.jsxs("div",{className:"MenuItemModalContent__name-description-box","data-testid":"MenuItemModalContent-NameAndDescription",children:[g.jsx(q,{className:"MenuItemModalContent__name",as:"h2",children:e.guestFacingName}),g.jsx(q,{className:"MenuItemModalContent__description",as:"p",font:"secondary",children:e.guestFacingDescriptionDigital})]}),g.jsxs("div",{className:"MenuItemModalContent__nutrition-and-abv",children:[n&&t&&g.jsx("div",{className:"MenuItemModalContent__nutrition","data-testid":"MenuItemModalContent-Nutrition",children:g.jsx(df,{energyKcalPerPortion:t,isInModal:!0,withComma:!!e.abv})}),e.abv&&g.jsx("div",{className:"MenuItemModalContent__abv","data-testid":"MenuItemModalContent-Abv",children:g.jsx(ff,{abv:e.abv,isInModal:!0})})]}),g.jsxs("div",{className:"MenuItemModalContent__price-and-dietary-info-featured","data-testid":"MenuItemModalContent-PriceAndDietaryInfoFeatured",children:[g.jsx(hf,{isInModal:!0,isVegan:e.claims.madeWithVeganIngs,isVegetarian:e.claims.madeWithVegetarianIngs}),e.isFeaturedItem&&g.jsx("div",{children:g.jsx(pf,{isInModal:!0})})]}),g.jsx("div",{className:"MenuItemModalContent__nutrition-and-allergy-info","data-testid":"MenuItemModalContent-NutritionAndAllergyInfo",children:g.jsx(cf,{href:r,text:"Nutrition & Allergy Info",icon:g.jsx(af,{className:"MenuItemModalContent__nutrition-icon"}),target:"_blank",variant:"medium",className:"MenuItemModalContent__nutrition-button"})})]})},jh=e=>{const{guestFacingName:t,guestFacingDescriptionDigital:n,portions:r=[],isGri:i=!1,claims:o,isFeaturedItem:l=!1,abv:u,"data-testid":s}=e,[a,m]=J.useState(!1),h=J.useCallback(()=>m(!0),[]),p=J.useCallback(()=>m(!1),[]),{energyKcalPerPortion:v,withNutrition:y}=sf(i,r);return g.jsxs(g.Fragment,{children:[a&&g.jsx(Lh,{onCloseModal:p,modalClassName:"Modal-menu-item",children:g.jsx(Th,{item:e})}),g.jsxs("article",{className:l?"Item__card Item__featured":"Item__card","data-testid":s||"MenuItem-Card",onClick:h,children:[g.jsxs("section",{className:"Item__details","data-testid":"MenuItem-Details",children:[g.jsxs("div",{className:"Item__name-description-box","data-testid":"MenuItem-NameAndDescriptionBox",children:[g.jsx(q,{as:"h2",className:l?"Item__name Item__featured-name":"Item__name","data-testid":"MenuItem-Name",children:t}),g.jsx(q,{font:"secondary",as:"p",className:l?"Item__description Item__featured-description":"Item__description","data-testid":"MenuItem-Description",children:n}),g.jsxs("div",{className:"Item__nutrition-and-abv",children:[y&&v&&g.jsx(df,{energyKcalPerPortion:v,"data-testid":"MenuItem-Nutrition",isFeaturedItem:l,withComma:!!u}),u&&g.jsx(ff,{abv:u,"data-testid":"MenuItem-Abv",isFeaturedItem:l})]})]}),g.jsx(hf,{isVegan:o==null?void 0:o.madeWithVeganIngs,isVegetarian:o==null?void 0:o.madeWithVegetarianIngs,"data-testid":"MenuItem-PriceAndNutrition",isFeaturedItem:l})]}),l&&g.jsx("div",{className:"Item__featured-box",children:g.jsx(pf,{"data-testid":"MenuItem-Featured"})})]})]})},mf=({menuCopyHeader:e,menuItems:t=[],isSubSection:n=!1,menuCopyCaption:r})=>g.jsxs("section",{className:`MenuSubSection__container ${n&&"MenuSubSection__container__subsection"}`,children:[g.jsxs("div",{className:"MenuSubSection__heading-and-caption",children:[g.jsx(q,{as:"h2",className:`MenuSubSection__title ${n&&"MenuSubSection__title__subsection"}`,children:e}),r&&g.jsx(q,{as:"p",className:"MenuSubSection__caption",font:"secondary",children:r})]}),g.jsx("div",{className:"MenuSubSection__items-grid",children:t.map(i=>g.jsx(jh,{...i},i.menuItemId))})]}),Rh=({sectionId:e,name:t,menuCopyHeader:n,subSections:r=[],menuItems:i=[],menuCopyCaption:o})=>r.length>0&&i.length===0?g.jsxs("div",{className:"MenuSection__wrapper",children:[g.jsxs("div",{className:"MenuSection__heading-and-caption",children:[g.jsx("div",{className:"MenuSection__heading MenuSection__container",children:g.jsx(q,{className:"MenuSection__title",children:n})}),o&&g.jsx(q,{as:"p",font:"secondary",className:"MenuSection__caption",children:o})]}),g.jsx("div",{className:"MenuSection__container MenuSection__subsection-container",children:g.jsx("div",{className:"MenuSection__subsection-wrapper",children:r.map(u=>g.jsx(mf,{subSectionId:u.subSectionId,name:u.name,menuCopyHeader:u.menuCopyHeader,menuItems:u.menuItems,isSubSection:!0,menuCopyCaption:u.menuCopyCaption},u.subSectionId))})})]}):g.jsx(mf,{subSectionId:e,name:t,menuCopyHeader:n,menuItems:i,menuCopyCaption:o}),zh=({menuId:e,name:t,guestFacingName:n,menuCopyDigitalFooter:r,guestFacingDescriptionDigital:i,sections:o=[]})=>{const{idType:l,brandId:u}=J.useContext(mr),s=J.useCallback(()=>{const a=wh("b2c_token");let m;const h={page_type:of.VIEW_MENU,page_sub_type:n,brand:u,bun_id:Eh(),brand_type:Ch(),login_status:a?du.LOGGED_IN:du.LOGGED_OUT};l===fu.BRAND?m={...h,page_hierarchy:hu.BRAND}:m={...h,page_hierarchy:hu.OUTLET,outlet_name:kh()},Sh(lf.PAGE_VIEW,m)},[u,n,l]);return J.useEffect(()=>{n&&s()},[n,s]),g.jsxs("article",{className:"MenuDetails__container",children:[g.jsx("div",{className:"MenuDetails__wrapper",children:g.jsx(Fh,{guestFacingName:n,guestFacingDescriptionDigital:i})}),g.jsxs("div",{className:"MenuDetails__wrapper",children:[g.jsx("div",{className:"MenuDetails__dietary-info__wrapper",children:g.jsx(Oh,{})}),g.jsx("section",{className:"MenuDetails__sections__wrapper",children:o.map(a=>g.jsx(Rh,{...a},a.sectionId))})]}),g.jsx("div",{className:"MenuDetails__footer__wrapper",children:g.jsx(Dh,{menuCopyDigitalFooter:r})})]},`${e}-${t}`)},vf=(e,t)=>t!=null&&t.trim()&&t!==""?t:e;var Ah={API_KEY:"Xa2zg862mdKG9oOWTDit7JNJ3fRdGWWzvcUyAF4b9d9TAcwE",NVM_INC:"/Users/macbook/.nvm/versions/node/v20.8.1/include/node",NODE:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node/node",INIT_CWD:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend",MAVEN_PROJECTBASEDIR:"/Users/macbook/WebstormProjects/mab-go-web",NVM_CD_FLAGS:"-q",SHELL:"/bin/zsh",TERM:"xterm-256color",TMPDIR:"/var/folders/l6/njb6cvms57x4gvtmtk0z9l7c0000gn/T/",npm_config_global_prefix:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend",npm_package_config_commitizen_path:"./ui.frontend/cz-config.cjs",COLOR:"0",TERM_SESSION_ID:"b5a398df-1cc4-4197-b91d-6dbe96649315",npm_config_noproxy:"",npm_config_local_prefix:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend",USER:"macbook",NVM_DIR:"/Users/macbook/.nvm",COMMAND_MODE:"unix2003",npm_config_globalconfig:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/etc/npmrc",SSH_AUTH_SOCK:"/private/tmp/com.apple.launchd.MmOJjtLjZO/Listeners",__CF_USER_TEXT_ENCODING:"0x1F5:0x1D:0x2A",npm_execpath:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node/node_modules/npm/bin/npm-cli.js",JAVA_MAIN_CLASS_22112:"org.codehaus.plexus.classworlds.launcher.Launcher",FIG_JETBRAINS_SHELL_INTEGRATION:"1",PATH:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node_modules/.bin:/Users/macbook/WebstormProjects/mab-go-web/node_modules/.bin:/Users/macbook/WebstormProjects/node_modules/.bin:/Users/macbook/node_modules/.bin:/Users/node_modules/.bin:/node_modules/.bin:/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node:/Users/macbook/.nvm/versions/node/v20.8.1/bin:/Library/Frameworks/Python.framework/Versions/2.7/bin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Library/Apple/usr/bin:/Applications/apache-maven-3.9.6/bin:/usr/bin/python3:",TERMINAL_EMULATOR:"JetBrains-JediTerm",npm_package_json:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/package.json",npm_config_userconfig:"/Users/macbook/.npmrc",npm_config_init_module:"/Users/macbook/.npm-init.js",__CFBundleIdentifier:"com.jetbrains.WebStorm",npm_command:"run-script",PWD:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend",npm_lifecycle_event:"build",EDITOR:"vi",npm_package_name:"mab-go-web",npm_config_npm_version:"10.1.0",XPC_FLAGS:"0x0",MAVEN_CMD_LINE_ARGS:" clean install -PautoInstallPackage",npm_package_engines_node:">=20",npm_config_node_gyp:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js",npm_package_version:"0.1.0",XPC_SERVICE_NAME:"0",SHLVL:"2",HOME:"/Users/macbook",npm_config_cache:"/Users/macbook/.npm",LOGNAME:"macbook",npm_lifecycle_script:"tsc && vite build && clientlib --verbose",LC_CTYPE:"UTF-8",NVM_BIN:"/Users/macbook/.nvm/versions/node/v20.8.1/bin",npm_config_user_agent:"npm/10.1.0 node/v20.8.1 darwin x64 workspaces/false",npm_node_execpath:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node/node",npm_config_prefix:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend",_:"/Users/macbook/WebstormProjects/mab-go-web/ui.frontend/node_modules/.bin/vite",NODE_ENV:"production"};const Uh=e=>new id({defaultOptions:{queries:{queryFn:async({queryKey:[t]})=>{if(typeof t=="string"){const n=await fetch(`${e}/${t}`,{method:"GET",headers:{"Content-type":"application/json; charset=UTF-8","x-apikey":Ah.API_KEY}});if(n.ok)return n.json();throw new Error("Something went wrong")}throw new Error("Invalid QueryKey")}}}});function Qh(e){return({apiUrl:t,...n})=>g.jsx(ph,{client:Uh(t),children:g.jsx(e,{...n})})}var yf,gf=ef;yf=gf.createRoot,gf.hydrateRoot;var $h=Object.defineProperty,Bh=(e,t,n)=>t in e?$h(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n,Bi=(e,t,n)=>(Bh(e,typeof t!="symbol"?t+"":t,n),n);const Vh={stringify:e=>e,parse:e=>e},Wh={stringify:e=>`${e}`,parse:e=>parseFloat(e)},Hh={stringify:e=>e?"true":"false",parse:e=>/^[ty1-9]/i.test(e)},Kh={stringify:e=>e.name,parse:(e,t)=>{const n=(()=>{if(typeof window<"u"&&e in window)return window[e];if(typeof global<"u"&&e in global)return global[e]})();return typeof n=="function"?n.bind(t):void 0}},qh={stringify:e=>JSON.stringify(e),parse:e=>JSON.parse(e)},mu={string:Vh,number:Wh,boolean:Hh,function:Kh,json:qh},vu=Symbol.for("r2wc.render"),Vi=Symbol.for("r2wc.connected"),Wt=Symbol.for("r2wc.context"),Pt=Symbol.for("r2wc.props");function bh(e,t,n){var r,i,o;t.props||(t.props=e.propTypes?Object.keys(e.propTypes):[]);const l=(Array.isArray(t.props)?t.props.slice():Object.keys(t.props)).filter(h=>h!=="container"),u={},s={},a={};for(const h of l){u[h]=Array.isArray(t.props)?"string":t.props[h];const p=Gh(h);s[h]=p,a[p]=h}class m extends HTMLElement{constructor(){super(),Bi(this,r,!0),Bi(this,i),Bi(this,o,{}),Bi(this,"container"),t.shadow?this.container=this.attachShadow({mode:t.shadow}):this.container=this,this[Pt].container=this.container;for(const p of l){const v=s[p],y=this.getAttribute(v),_=u[p],O=mu[_];y&&O!=null&&O.parse&&(this[Pt][p]=O.parse(y,this))}}static get observedAttributes(){return Object.keys(a)}connectedCallback(){this[Vi]=!0,this[vu]()}disconnectedCallback(){this[Vi]=!1,this[Wt]&&n.unmount(this[Wt]),delete this[Wt]}attributeChangedCallback(p,v,y){const _=a[p],O=u[_],d=mu[O];_ in u&&d!=null&&d.parse&&(this[Pt][_]=d.parse(y,this),this[vu]())}[(r=Vi,i=Wt,o=Pt,vu)](){this[Vi]&&(this[Wt]?n.update(this[Wt],this[Pt]):this[Wt]=n.mount(this.container,e,this[Pt]))}}for(const h of l){const p=s[h],v=u[h];Object.defineProperty(m.prototype,h,{enumerable:!0,configurable:!0,get(){return this[Pt][h]},set(y){this[Pt][h]=y;const _=mu[v];if(_!=null&&_.stringify){const O=_.stringify(y);this.getAttribute(p)!==O&&this.setAttribute(p,O)}}})}return m}function Gh(e=""){return e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase()}function Yh(e,t,n){const r=yf(e),i=oe.createElement(t,n);return r.render(i),{root:r,ReactComponent:t}}function Xh({root:e,ReactComponent:t},n){const r=oe.createElement(t,n);e.render(r)}function Zh({root:e}){e.unmount()}function Jh(e,t={}){return bh(e,t,{mount:Yh,update:Xh,unmount:Zh})}((e,t,n)=>{const r=Jh(e,{props:n});return window.customElements.define(t,r),e})(Qh(({id:e,idType:t,pagePath:n,menuNameOverride:r,menuDescriptionOverride:i,brandId:o,menuItemHighlightText:l,smartChefUrl:u})=>{const s=`?id=${e}&websitePageUrlPath=${n}&idType=${t}`,{isLoading:a,error:m,data:h}=_h(s);if(a)return g.jsx("div",{children:"Loading..."});if(m)return g.jsx("div",{children:"Error happened"});if(!h)return g.jsx("div",{children:"No data"});const p=vf(h.guestFacingName,r),v=vf(h.guestFacingDescriptionDigital,i);return g.jsx(mr.Provider,{value:{idType:t,brandId:o,menuItemHighlightText:l,smartChefUrl:u},children:g.jsx(zh,{...h,guestFacingName:p,guestFacingDescriptionDigital:v})})}),"mab-menu",{id:"string",apiUrl:"string",idType:"string",pagePath:"string",menuNameOverride:"string",menuDescriptionOverride:"string",brandId:"string",menuItemHighlightText:"string",smartChefUrl:"string"})})();
//# sourceMappingURL=index-Dep9lQvh.js.map

