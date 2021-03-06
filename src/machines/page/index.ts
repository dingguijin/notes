import { Machine, assign, actions, StateNodeConfig } from "xstate";
import { Node, createEditor, Editor, Range, NodeEntry } from "slate";
import { withHistory } from "slate-history";
import withLinks, { placeholderNode } from "../../plugins/withLinks";
import withHyperlinks from "../../plugins/withHyperlinks";
import withCodeBlockListItems from "../../plugins/withCodeBlockListItems";
import withSoftBreaks from "../../plugins/withSoftBreaks";
import withHelpers from "../../plugins/withHelpers";
import withList from "../../plugins/withList";
import { withReact, ReactEditor } from "slate-react";
import { createRef } from "react";
import pageSyncState from "./syncState";
import loadingState from "./loadingState";
import editingLinkState from "./editingLinkState";
import selectedListItemState from "./selectedListItemState";
import { arraysEqual } from "../../utils/array";

import {
  CLOSE_BRACKET,
  KEY_DOWN,
  CHANGE,
  BACKSPACE,
  UNINDENT_NODE,
  INDENT_NODE,
  INIT_LINK,
  LINK_CREATED,
  INSERT_BREAK,
  INSERT_SOFT_BREAK,
  TOGGLE_CODE_BLOCK,
} from "./events";

const { send } = actions;

export interface IContext {
  editor: Editor;
  upsertLinks(links: any): any;
  upsertPage(page: any): any;
  title: string;
  value: Node[] | any[];
  deleteLinks(linkIds: any): any;
  getOrCreatePage(variables: any): Promise<any>;
  getLinksByValue(value: any): Promise<any>;
  getPagesByTitle(value: any): Promise<any>;
  placeholderNode: Node;
  canBackspace: boolean;
  filteredPages: any[];
  PagesTooltipRef: any;
  linkValueAtSelection: string;
  activeLinkId: string | null;
  errorMessage: string;
  touchedLinkNodes: Node[];
  tags: any[];
  prevSelectedListItem: NodeEntry | null;
  selectedListItem: NodeEntry | null;
}

export interface ISchema {
  states: {
    failed: {};
    loading: {};
    loaded: {
      states: {
        selectedListItem: {};
        sync: {
          states: {
            unsynced: {};
            synced: {};
            failure: {};
            syncingPage: {};
            syncingLinks: {};
            deletingLinks: {};
          };
        };
        base: {};
        editingLink: {
          states: {
            notEditing: {};
            creatingNewPagesFromLinks: {};
            settingLinkNodeValues: {};
            syncing: {};
            editing: {
              states: {
                base: {};
                data: {
                  states: {
                    idle: {};
                    loading: {};
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}

export type IEvent =
  | { type: "KEY_DOWN"; key: string; shiftKey: boolean; metaKey: boolean }
  | { type: "CHANGE"; value: any }
  | { type: "INDENT_NODE" }
  | { type: "BACKSPACE" }
  | { type: "SYNC" }
  | { type: "INSERT_BREAK" }
  | { type: "INSERT_SOFT_BREAK" }
  | { type: "SELECT_LINK" }
  | { type: "LINK_UPDATED" }
  | { type: "SYNC_LIST_ITEM" }
  | { type: "SET_SELECTED_LIST_ITEM_NODE_LINK_CHILDREN" }
  | { type: "UNINDENT_NODE" }
  | { type: "INIT_LINK" }
  | { type: "LINK_CREATED" }
  | { type: "TOGGLE_CODE_BLOCK" }
  | {
      type: "CLOSE_BRACKET";
    };

const getTriggerEvent = (
  { editor }: IContext,
  { key, shiftKey, metaKey }: any
) => {
  switch (key) {
    case "Enter":
      if (shiftKey) {
        return { type: INSERT_SOFT_BREAK };
      } else {
        return { type: INSERT_BREAK };
      }
    case "Tab":
      if (shiftKey) {
        return { type: UNINDENT_NODE };
      } else return { type: INDENT_NODE };
    case "[":
      if (editor.willInitLink()) {
        return { type: INIT_LINK };
      } else {
        return { type: CLOSE_BRACKET };
      }
    case "/":
      if (metaKey) {
        return { type: TOGGLE_CODE_BLOCK };
      }
    case "Backspace":
      return { type: BACKSPACE };
    default:
      // TODO: better way to bail?
      return { type: "" };
  }
};

function canBackspace({ editor }: IContext) {
  return editor.canBackspace();
}

const createPageMachine = ({
  upsertLinks,
  upsertPage,
  deleteLinks,
  title,
  getOrCreatePage,
  getLinksByValue,
  getPagesByTitle,
}: any) =>
  Machine<IContext, ISchema, IEvent>(
    {
      id: `page-${title}`,
      initial: "loading",
      context: {
        editor: withCodeBlockListItems(
          withSoftBreaks(
            withLinks(
              withHyperlinks(
                withHistory(withList(withHelpers(withReact(createEditor()))))
              )
            )
          )
        ),
        upsertLinks,
        upsertPage,
        deleteLinks,
        title,
        getOrCreatePage,
        placeholderNode,
        getLinksByValue,
        getPagesByTitle,
        canBackspace: true,
        value: [],
        filteredPages: [],
        PagesTooltipRef: createRef(),
        linkValueAtSelection: "",
        activeLinkId: "",
        errorMessage: "",
        touchedLinkNodes: [],
        tags: [],
        prevSelectedListItem: null,
        selectedListItem: null,
      },
      states: {
        failed: {},
        loading: {
          ...loadingState,
        },
        loaded: {
          type: "parallel",
          states: {
            sync: {
              ...(pageSyncState as StateNodeConfig<IContext, any, IEvent>),
              initial: "synced",
            },
            selectedListItem: {
              ...(selectedListItemState as any),
            },
            editingLink: {
              ...(editingLinkState as StateNodeConfig<IContext, any, IEvent>),
              initial: "notEditing",
            },
            base: {
              on: {
                [CHANGE]: {
                  actions: [
                    assign<IContext>({
                      canBackspace,
                      value: (_: IContext, { value }: any) => value,
                    }),
                  ],
                },
                [BACKSPACE]: {
                  actions: ["backspace"],
                },
                [UNINDENT_NODE]: {
                  actions: ["unindentNode"],
                },
                [TOGGLE_CODE_BLOCK]: {
                  actions: ["toggleCodeBlock"],
                },
                [INDENT_NODE]: {
                  actions: ["indentNode"],
                },
                [INSERT_BREAK]: {
                  actions: ["insertBreak"],
                },
                [INSERT_SOFT_BREAK]: {
                  actions: ["insertSoftBreak"],
                },
                [KEY_DOWN]: {
                  actions: [send(getTriggerEvent)],
                },
                [CLOSE_BRACKET]: {
                  actions: ["closeBracket"],
                },
                [INIT_LINK]: {
                  actions: ["closeBracket", "initLink", send(LINK_CREATED)],
                },
              },
            },
          },
        },
      },
    },
    {
      guards: {
        isEditingLinkNode: ({ editor }: IContext) => {
          return !!editor.touchedLinkNodes().length;
        },
        isNotEditingLinkNode: ({ editor }: IContext) => {
          return !editor.touchedLinkNodes().length;
        },
        isEditingNewLinkNode: ({ editor, activeLinkId }: IContext) => {
          const parent = editor.getParentNodeAtSelection();
          return parent.id !== activeLinkId;
        },
        isSelectionAtNewListItem: ({
          prevSelectedListItem,
          selectedListItem,
        }: IContext) => {
          if (!selectedListItem || !prevSelectedListItem) return true;
          return !arraysEqual(prevSelectedListItem[1], selectedListItem[1]);
        },
      },
      actions: {
        positionTooltip: ({ PagesTooltipRef, editor }: IContext) => {
          const { selection } = editor;
          if (selection && Range.isCollapsed(selection)) {
            setTimeout(() => {
              try {
                const [start] = Range.edges(selection);
                const wordBefore =
                  start && Editor.before(editor, start, { unit: "word" });
                const before = wordBefore && Editor.before(editor, wordBefore);
                let beforeRange = before && Editor.range(editor, before, start);

                const domRange = ReactEditor.toDOMRange(
                  editor as ReactEditor,
                  beforeRange || (editor.selection as Range)
                );
                const rect = domRange.getBoundingClientRect();
                if (PagesTooltipRef?.current) {
                  PagesTooltipRef.current.style.top = `${
                    rect.top + window.pageYOffset + 24
                  }px`;
                  PagesTooltipRef.current.style.left = `${
                    rect.left + window.pageXOffset
                  }px`;
                }
              } catch (e) {
                if (PagesTooltipRef?.current) {
                  PagesTooltipRef.current.style.display = "hidden";
                }
              }
            }, 0);
          }
        },
        backspace: ({ editor, canBackspace }: IContext) => {
          if (canBackspace) {
            editor.handleBackSpace();
          }
        },
        unindentNode: ({ editor }: IContext) => {
          editor.unindentNode();
        },
        indentNode: ({ editor }: IContext) => {
          editor.indentNode();
        },
        insertBreak: ({ editor }: IContext) => {
          editor.insertBreak();
        },
        insertSoftBreak: ({ editor }: IContext) => {
          editor.insertSoftBreak();
        },
        closeBracket: ({ editor }: IContext) => {
          editor.closeBracket();
        },
        toggleCodeBlock: ({ editor }: IContext) => {
          editor.toggleCodeBlock();
        },
        initLink: ({ editor }: IContext) => {
          editor.initLink();
        },
        setSelectedLinkValue: ({ editor }: IContext, event: any) => {
          editor.setLinkValue({ value: event.node.title });
        },
        removeBrokenLinkNodeEntries: ({
          editor,
          touchedLinkNodes,
        }: IContext) => {
          setTimeout(() => {
            editor.removeBrokenLinkNodeEntries({ touchedLinkNodes });
          }, 0);
        },
        setLinkNodeValues: ({ editor }: IContext) => {
          setTimeout(() => {
            editor.setLinkNodeValues();
          }, 0);
        },
        wrapHyperlinks: ({ editor, prevSelectedListItem }: IContext) => {
          if (!prevSelectedListItem) return;
          setTimeout(() => {
            editor.wrapHyperlinks(prevSelectedListItem);
          }, 0);
        },
        unwrapHyperlinks: ({ editor, selectedListItem }: IContext) => {
          if (!selectedListItem) return;
          setTimeout(() => {
            editor.unwrapHyperlinks(selectedListItem);
          }, 0);
        },
      },
    }
  );

export default createPageMachine;
