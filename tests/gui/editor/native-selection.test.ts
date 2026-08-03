/**
 * prose 选区扩展可挂载
 */
import * as path from 'path';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const { createProseSelectionExtension } = require(path.join(
  __dirname,
  '../../../src/gui/renderer/editor/view/tight-selection.js'
));

describe('native-selection / prose-selection', () => {
  test('createProseSelectionExtension 可挂到 EditorState', () => {
    const state = EditorState.create({
      doc: 'hello',
      extensions: createProseSelectionExtension(),
    });
    expect(state.doc.toString()).toBe('hello');
    expect(state.facet(EditorView.editable)).toBe(true);
  });
});
