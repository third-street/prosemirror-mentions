/**
 * See https://prosemirror.net/docs/ref/#model.NodeSpec
 */
export const mentionNode = {
  group: "inline",
  inline: true,
  atom: true,

  attrs: {
    ID: "",
    Name: ""
  },

  selectable: false,
  draggable: false,

  toDOM: node => {
    return [
      "span",
      {
        "data-mention-id": node.attrs.ID,
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
      tag: "span[data-mention-id][data-mention-name]",

      getAttrs: dom => {
        var ID = dom.getAttribute("data-mention-id");
        var Name = dom.getAttribute("data-mention-name");
        return {
          ID: ID,
          Name: Name
        };
      }
    }
  ]
};

/**
 * See https://prosemirror.net/docs/ref/#model.NodeSpec
 */
export const tagNode = {
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
