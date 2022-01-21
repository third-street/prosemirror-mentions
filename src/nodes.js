/**
 * See https://prosemirror.net/docs/ref/#model.NodeSpec
 */
export const mentionNode = {
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
        "data-mention-name": node.attrs.Name,
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
