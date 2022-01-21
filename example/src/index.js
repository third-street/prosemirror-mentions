import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser, Node } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { exampleSetup } from "prosemirror-example-setup";
import {
  addMentionNodes,
  addTagNodes,
  getMentionsPlugin
} from "prosemirror-mentions";

var schema = new Schema({
  nodes: addTagNodes(addMentionNodes(basicSchema.spec.nodes)),
  marks: basicSchema.spec.marks
});

var getMentionSuggestionsHTML = items =>
  '<div class="suggestion-item-list">' +
  items.map(i => '<div class="suggestion-item">' + i.Name + "</div>").join("") +
  "</div>";

var getTagSuggestionsHTML = items =>
  '<div class="suggestion-item-list">' +
  items.map(i => '<div class="suggestion-item">' + i.tag + "</div>").join("") +
  "</div>";

var mentionPlugin = getMentionsPlugin({
  getSuggestions: (type, text, done) => {
    setTimeout(() => {
      if (type === "mention") {
        // pass dummy mention suggestions
        done([
          { Name: "John Doe", TypeID: "123", ID: "101" },
          { Name: "Joe Lewis", TypeID: "111", ID: "102" }
        ]);
      } else {
        // pass dummy tag suggestions
        done([{ tag: "WikiLeaks" }, { tag: "NetNeutrality" }]);
      }
    }, 0);
  },
  getSuggestionsHTML: (items, type) => {
    if (type === "mention") {
      return getMentionSuggestionsHTML(items);
    } else if (type === "tag") {
      return getTagSuggestionsHTML(items);
    }
  }
});

var plugins = exampleSetup({ schema: schema });
plugins.unshift(mentionPlugin); // push it before keymap plugin to override keydown handlers

window.view = new EditorView(document.querySelector("#editor"), {
  state: EditorState.create({
    doc: DOMParser.fromSchema(schema).parse(document.querySelector("#content")),
    plugins: plugins
  })
});
