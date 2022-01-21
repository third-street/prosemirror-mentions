"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

var prosemirrorState = require("prosemirror-state");
var prosemirrorView = require("prosemirror-view");

/**
 *
 * @param {String} mentionTrigger
 * @param {String} hashtagTrigger
 * @param {bool} allowSpace
 * @returns {Object}
 */
function getRegexp(mentionTrigger, hashtagTrigger, allowSpace) {
  var mention = allowSpace
    ? new RegExp("(^|\\s)" + mentionTrigger + "(.+\\s?.*)$")
    : new RegExp("(^|\\s)" + mentionTrigger + "([\\w-\\+]+)$");

  // hashtags should never allow spaces. I mean, what's the point of allowing spaces in hashtags?
  var tag = new RegExp("(^|\\s)" + hashtagTrigger + "([\\w-]+)$");

  return {
    mention: mention,
    tag: tag
  };
}

/**
 *
 * @param {ResolvedPosition} $position https://prosemirror.net/docs/ref/#model.Resolved_Positions
 * @param {JSONObject} opts
 * @returns {JSONObject}
 */
function getMatch($position, opts) {
  // take current para text content upto cursor start.
  // this makes the regex simpler and parsing the matches easier.
  var parastart = $position.before();
  const text = $position.doc.textBetween(parastart, $position.pos, "\n", "\0");

  var regex = getRegexp(
    opts.mentionTrigger,
    opts.hashtagTrigger,
    opts.allowSpace
  );

  // only one of the below matches will be true.
  var mentionMatch = text.match(regex.mention);
  var tagMatch = text.match(regex.tag);

  var match = mentionMatch || tagMatch;

  // set type of match
  var type;
  if (mentionMatch) {
    type = "mention";
  } else if (tagMatch) {
    type = "tag";
  }

  // if match found, return match with useful information.
  if (match) {
    // adjust match.index to remove the matched extra space
    match.index = match[0].startsWith(" ") ? match.index + 1 : match.index;
    match[0] = match[0].startsWith(" ")
      ? match[0].substring(1, match[0].length)
      : match[0];

    // The absolute position of the match in the document
    var from = $position.start() + match.index;
    var to = from + match[0].length;

    var queryText = match[2];

    return {
      range: { from: from, to: to },
      queryText: queryText,
      type: type
    };
  }
  // else if no match don't return anything.
}

/**
 * Util to debounce call to a function.
 * >>> debounce(function(){}, 1000, this)
 */
const debounce = (function() {
  var timeoutId = null;
  return function(func, timeout, context) {
    context = context || this;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(function() {
      func.apply(context, arguments);
    }, timeout);

    return timeoutId;
  };
})();

var getNewState = function() {
  return {
    active: false,
    range: {
      from: 0,
      to: 0
    },
    type: "", //mention or tag
    text: "",
    suggestions: [],
    index: 0, // current active suggestion index
    startIndex: 1,
    endOfList: false
  };
};

/**
 * @param {JSONObject} opts
 * @returns {Plugin}
 */
function getMentionsPlugin(opts) {
  // default options
  var defaultOpts = {
    mentionTrigger: "@",
    hashtagTrigger: "#",
    allowSpace: true,
    getSuggestions: (text, start, fetchNumber, cb) => {
      cb([]);
    },
    getSuggestionsHTML: items =>
      items
        .map(
          item =>
            `<div class="suggestion-item si-${item.ID}">${
              item.DisplayName
            }</div>`
        )
        .join(""),
    showLoadingBar: (showLoading, itemList) => {
      if (showLoading === "true") {
        itemList.style.display = "none";
      } else {
        itemList.style.display = "block";
      }
    },
    activeClass: "suggestion-item-active",
    suggestionTextClass: "prosemirror-suggestion",
    fetchNumber: 30,
    delay: 500
  };

  var opts = Object.assign({}, defaultOpts, opts);

  // timeoutId for clearing debounced calls
  var showListTimeoutId = null;

  // dropdown element
  var el = document.createElement("div");
  el.className = "suggestion-outer-list";

  // ----- methods operating on above properties -----
  var showList = function(view, state, opts) {
    if (el.style.display === "none") {
      // get current @mention span left and top.
      // TODO: knock off domAtPos usage. It's not documented and is not officially a public API.
      // It's used currently, only to optimize the query for textDOM
      var node = view.domAtPos(view.state.selection.$from.pos);
      var paraDOM = node.node;
      var textDOM = paraDOM.querySelector("." + opts.suggestionTextClass);

      var offset = textDOM.getBoundingClientRect();
      document.body.appendChild(el);
      el.style.position = "fixed";
      el.style.left = offset.left + "px";

      var top = textDOM.offsetHeight + offset.top;
      el.style.top = top + "px";
      el.style.display = "block";
    }

    var onScroll = function() {
      var newScroll = el.querySelector(".suggestion-item-list").scrollTop;
      if (
        (state.lastScroll === 0 || state.lastScroll < newScroll
          ? newScroll > opts.fetchNumber * 75 && !state.endOfList
          : newScroll < opts.fetchNumber * 15) &&
        !state.scrolled
      ) {
        state.scrolled = true;
        opts.showLoadingBar("true", el.querySelector(".suggestion-item-list"));
        setTimeout(function() {
          doScroll(view, state, opts, newScroll);
        }, opts.delay);
      }
    };

    // Check for new list state
    if (state.startIndex === 1 && state.endIndex === opts.fetchNumber * 3) {
      state.lastScroll = 0;
      el.innerHTML =
        '<div data-cy="mention-list" class="suggestion-item-list" style="width:250px;position:relative;overflow:scroll;max-height:250px;" (click)="emitEditorValueChange()">' +
        opts.getSuggestionsHTML(state.suggestions) +
        "</div>";
    } else {
      state.scrolled = true;
      var itemList = el.querySelector(".suggestion-item-list");
      itemList.removeEventListener("scroll", onScroll);
      itemList.innerHTML = opts.getSuggestionsHTML(state.suggestions);
      var lastElement = itemList.querySelector("." + state.lastElement);
      if (lastElement) {
        itemList.scrollTop = lastElement.offsetTop;
        state.lastScroll = lastElement.offsetTop;
      }
    }

    // attach new item event handlers
    el.querySelectorAll(".suggestion-item").forEach(function(itemNode, index) {
      itemNode.addEventListener("click", function() {
        select(view, state);
        view.focus();
      });
      itemNode.addEventListener("mouseover", function() {
        setIndex(itemNode, index, state, opts);
      });
      itemNode.addEventListener("mouseout", function() {
        setIndex(itemNode, index, state, opts);
      });
    });

    // highlight first element by default - like Facebook.
    addClassAtIndex(state.index, opts.activeClass);

    var itemList = el.querySelector(".suggestion-item-list");
    opts.showLoadingBar("false", itemList);
    if (
      itemList &&
      (state.startIndex > 1 || state.suggestions.length >= opts.fetchNumber * 3)
    ) {
      state.scrolled = false;
      itemList.addEventListener("scroll", onScroll, { passive: true });
    }
  };

  var doScroll = async function(view, state, opts, newScroll) {
    var itemList = el.querySelector(".suggestion-item-list");
    if (itemList) {
      var visElem = Array.from(el.querySelectorAll(".suggestion-item")).find(
        elem => newScroll < elem.offsetTop
      );
      state.lastElement = visElem.classList[1];
      if (newScroll > state.lastScroll) {
        state = await nextPage(view, state, opts);
      } else {
        state = await prevPage(view, state, opts);
      }
    }
  };

  var hideList = function() {
    el.style.display = "none";
  };

  var removeClassAtIndex = function(index, className) {
    var itemList = el.querySelector(".suggestion-item-list").childNodes;
    var prevItem = itemList[index];
    if (prevItem) {
      prevItem.classList.remove(className);
    }
  };

  var addClassAtIndex = function(index, className) {
    var itemList = el.querySelector(".suggestion-item-list").childNodes;
    var prevItem = itemList[index];
    if (prevItem) {
      prevItem.classList.add(className);
    }
  };

  var addClassOnItem = function(item, className) {
    if (item) {
      item.classList.add(className);
    }
  };

  var setIndex = function(item, index, state, opts) {
    removeClassAtIndex(state.index, opts.activeClass);
    state.index = index;
    addClassOnItem(item, opts.activeClass);
  };

  var goNext = async function(view, state, opts) {
    removeClassAtIndex(state.index, opts.activeClass);
    state.index++;
    if (state.index >= 24) {
      state = await nextPage(view, state, opts);
    }
    addClassAtIndex(index, opts.activeClass);
  };

  var goPrev = async function(view, state, opts) {
    removeClassAtIndex(state.index, opts.activeClass);
    state.index--;
    if (state.index < 6) {
      state = await prevPage(view, state, opts);
    }
    addClassAtIndex(index, opts.activeClass);
  };

  var prevPage = async function(view, state, opts) {
    if (state.startIndex > 1) {
      state.startIndex =
        state.startIndex > opts.fetchNumber
          ? state.startIndex - opts.fetchNumber
          : 1;
      var lastValue;
      if (state.suggestions.length > 0 )
      {
        lastValue = state.suggestions[0].Name;
      }
      // get suggestions and set new state
      opts.getSuggestions(
        state.text,
        state.endIndex - state.startIndex - (opts.fetchNumber * 3 - 1),
        lastValue,
        true,
        function(suggestions) {
          state.endOfList = false;
          // update `state` argument with suggestions
          state.endIndex = state.startIndex + opts.fetchNumber * 3 - 1;
          state.suggestions = state.suggestions.slice(0, -opts.fetchNumber);
          state.suggestions = suggestions.concat(state.suggestions);
          showList(view, state, opts);
        }
      );
    }
  };

  var nextPage = async function(view, state, opts) {
    if (!state.endOfList) {
      var lastValue;
      if (state.suggestions.length > 0 )
      {
        lastValue = state.suggestions[state.suggestions.length - 1].Name;
      }
      // get suggestions and set new state
      opts.getSuggestions(
        state.text,
        opts.fetchNumber,
        lastValue,
        false,
        function(suggestions) {
          if (suggestions.length < opts.fetchNumber) {
            state.endOfList = true;
          }
          // update `state` argument with suggestions
          if (suggestions.length > 0) {
            state.endIndex = state.endIndex + suggestions.length;
            state.startIndex = state.startIndex + suggestions.length;
            state.suggestions = state.suggestions.slice(suggestions.length);
            state.suggestions = state.suggestions.concat(suggestions);
          }
          showList(view, state, opts);
        }
      );
    } else {
      showList(view, state, opts);
    }
  };

  var select = function(view, state) {
    var item = state.suggestions[state.index];
    if (item) {
      var attrs;
      if (state.type === "mention") {
        attrs = {
          Name: item.Name,
          TypeID: item.TypeID,
          ID: item.ID
        };
      } else {
        attrs = {
          tag: item.tag
        };
      }
      var node = view.state.schema.nodes[state.type].create(attrs);
      var tr = view.state.tr.replaceWith(state.range.from, state.range.to, node);

      var newState = view.state.apply(tr);
      view.updateState(newState);
    }
  };

  /**
   * See https://prosemirror.net/docs/ref/#state.Plugin_System
   * for the plugin properties spec.
   */
  return new Plugin({
    key: new PluginKey("autosuggestions"),

    // we will need state to track if suggestion dropdown is currently active or not
    state: {
      init() {
        return getNewState();
      },

      apply(tr, state) {
        // compute state.active for current transaction and return
        var newState = getNewState();
        var selection = tr.selection;
        if (selection.from !== selection.to) {
          return newState;
        }

        const $position = selection.$from;
        const match = getMatch($position, opts);

        // if match found update state
        if (match) {
          newState.active = true;
          newState.range = match.range;
          newState.type = match.type;
          newState.text = match.queryText;
        }

        return newState;
      }
    },

    // We'll need props to hi-jack keydown/keyup & enter events when suggestion dropdown
    // is active.
    props: {
      handleKeyDown(view, e) {
        var state = this.getState(view.state);

        // don't handle if no suggestions or not in active mode
        if (!state.active && !state.suggestions.length) {
          return false;
        }

        // if any of the below keys, override with custom handlers.
        var down, up, enter, esc;
        enter = e.keyCode === 13;
        down = e.keyCode === 40;
        up = e.keyCode === 38;
        esc = e.keyCode === 27;

        if (down) {
          goNext(view, state, opts);
          return true;
        } else if (up) {
          goPrev(view, state, opts);
          return true;
        } else if (enter) {
          select(view, state);
          return true;
        } else if (esc) {
          clearTimeout(showListTimeoutId);
          hideList();
          this.state = getNewState();
          return true;
        } else {
          // didn't handle. handover to prosemirror for handling.
          return false;
        }
      },

      // to decorate the currently active @mention text in ui
      decorations(editorState) {
        const { active, range } = this.getState(editorState);

        if (!active) return null;

        return DecorationSet.create(editorState.doc, [
          Decoration.inline(range.from, range.to, {
            nodeName: "span",
            class: opts.suggestionTextClass
          })
        ]);
      }
    },

    // To track down state mutations and add dropdown reactions
    view() {
      return {
        update: view => {
          var state = this.key.getState(view.state);
          var lastValue;
          if (state.suggestions.length > 0 )
          {
            lastValue = state.suggestions[state.suggestions.length - 1].Name;
          }
          if (!state.text) {
            hideList();
            clearTimeout(showListTimeoutId);
            return;
          }
          // debounce the call to avoid multiple requests
          showListTimeoutId = debounce(
            function() {
              // get suggestions and set new state
              state.endIndex = opts.fetchNumber * 3;
              opts.getSuggestions(
                state.text,
                state.endIndex,
                lastValue,
                false,
                function(suggestions) {
                  // update `state` argument with suggestions
                  state.suggestions = suggestions;
                  showList(view, state, opts);
                }
              );
            },
            opts.delay,
            this
          );
        }
      };
    }
  });
}

/**
 * See https://prosemirror.net/docs/ref/#model.NodeSpec
 */
const mentionNode = {
  group: "inline",
  inline: true,
  atom: true,

  attrs: {
    ID: "",
    TypeID: "",
    Name: ""
  },

  selectable: false,
  draggable: false,

  toDOM: node => {
    return [
      "span",
      {
        "data-mention-id": node.attrs.ID,
        "data-mention-typeid": node.attrs.TypeID,
        "data-mention-Name": node.attrs.Name,
        title: node.attrs.Name,
        class: "prosemirror-mention-node"
      },
      "@" + node.attrs.Name
    ];
  },

  parseDOM: [
    {
      // match tag with following CSS Selector
      tag: "span[data-mention-id][data-mention-typeid][data-mention-name]",

      getAttrs: dom => {
        var ID = dom.getAttribute("data-mention-id");
        var TypeID = dom.getAttribute("data-mention-typeid");
        var Name = dom.getAttribute("data-mention-name");
        return {
          ID: ID,
          TypeID: TypeID,
          Name: Name
        };
      }
    }
  ]
};

/**
 * See https://prosemirror.net/docs/ref/#model.NodeSpec
 */
const tagNode = {
  group: "inline",
  inline: true,
  atom: true,

  attrs: {
    tag: ""
  },

  selectable: false,
  draggable: false,

  toDOM: node => {
    return [
      "span",
      {
        "data-tag": node.attrs.tag,
        class: "prosemirror-tag-node"
      },
      "#" + node.attrs.tag
    ];
  },

  parseDOM: [
    {
      // match tag with following CSS Selector
      tag: "span[data-tag]",

      getAttrs: dom => {
        var tag = dom.getAttribute("data-tag");
        return {
          tag: tag
        };
      }
    }
  ]
};

/**
 *
 * @param {OrderedMap} nodes
 * @returns {OrderedMap}
 */
function addMentionNodes(nodes) {
  return nodes.append({
    mention: mentionNode
  });
}

/**
 *
 * @param {OrderedMap} nodes
 * @returns {OrderedMap}
 */
function addTagNodes(nodes) {
  return nodes.append({
    tag: tagNode
  });
}

exports.getMentionsPlugin = getMentionsPlugin;
exports.addMentionNodes = addMentionNodes;
exports.addTagNodes = addTagNodes;
exports.tagNode = tagNode;
exports.mentionNode = mentionNode;
