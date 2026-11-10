/* Quran Reader - InDesign footnote bridge.
 * ExtendScript ES3-compatible: designed for InDesign CC 2018 (13.x) and later.
 * app.doScript groups all mutations into one native InDesign undo step on macOS.
 */
var quranFootnoteResult = app.doScript(function () {
    return (function () {
    var payload = __QURAN_PAYLOAD_JSON__;
    function quranHasType(object, expected) {
        try {
            if (object && object.constructor && object.constructor.name === expected) return true;
        } catch (e1) {}
        try {
            if (object && object.reflect && object.reflect.name === expected) return true;
        } catch (e2) {}
        return false;
    }

    function quranFindFootnote(object) {
        var current = object;
        var depth;
        for (depth = 0; depth < 16 && current; depth += 1) {
            try {
                if (quranHasType(current, 'Footnote') && current.isValid) {
                    return current;
                }
            } catch (e1) {}
            try {
                var parent = current.parent;
                if (!parent || parent === current) break;
                current = parent;
            } catch (e2) {
                break;
            }
        }
        return null;
    }

    try {
        if (!payload || !payload.text || !payload.reference) {
            return 'QURAN_ERROR|INSERT_FAILED';
        }
        if (!app.documents || app.documents.length < 1) {
            return 'QURAN_ERROR|NO_DOCUMENT';
        }

        var doc = app.activeDocument;
        if (!doc || !doc.isValid) {
            return 'QURAN_ERROR|NO_DOCUMENT';
        }
        if (!app.selection || app.selection.length < 1 || !app.selection[0]) {
            return 'QURAN_ERROR|NO_SELECTION';
        }

        var target = app.selection[0];
        var story = null;
        var startIndex = -1;
        var footnoteContext = quranFindFootnote(target);

        /* Recover a caret left in a previous footnote, using its main-story marker. */
        if (footnoteContext) {
            var oldMarker = footnoteContext.storyOffset;
            if (!oldMarker || !oldMarker.isValid || !oldMarker.parentStory) {
                return 'QURAN_ERROR|FOOTNOTE_POSITION';
            }
            story = oldMarker.parentStory;
            startIndex = Number(oldMarker.index) + 1;
            target = story.insertionPoints.item(startIndex);
        } else {
            var isInsertionPoint = quranHasType(target, 'InsertionPoint');
            var isTextRange = quranHasType(target, 'Text') ||
                quranHasType(target, 'TextStyleRange') ||
                quranHasType(target, 'Word') ||
                quranHasType(target, 'Character') ||
                quranHasType(target, 'Line') ||
                quranHasType(target, 'Paragraph') ||
                quranHasType(target, 'TextColumn');
            if (isInsertionPoint) {
                story = target.parentStory;
                startIndex = Number(target.index);
            } else if (isTextRange) {
                story = target.parentStory;
                if (target.insertionPoints && target.insertionPoints.length > 0) {
                    startIndex = Number(target.insertionPoints.item(0).index);
                }
            } else {
                return 'QURAN_ERROR|TEXT_REQUIRED';
            }
        }

        if (!story || !story.isValid || startIndex < 0) {
            return 'QURAN_ERROR|STORY_INVALID';
        }

        var storyId = Number(story.id);
        var insertText = String(payload.text);
        var referenceText = String(payload.reference);

        /* Replace a text selection, or insert at the active insertion point. */
        target.contents = insertText;

        /* Re-resolve the story after mutation; old InDesign specifiers can become stale. */
        story = doc.stories.itemByID(storyId);
        if (!story || !story.isValid) {
            return 'QURAN_ERROR|STORY_INVALID';
        }

        var endIndex = startIndex + insertText.length;
        var endPoint = story.insertionPoints.item(endIndex);
        if (!endPoint || !endPoint.isValid) {
            return 'QURAN_ERROR|STORY_INVALID';
        }

        var footnote = endPoint.footnotes.add();
        if (!footnote || !footnote.isValid) {
            return 'QURAN_ERROR|INSERT_FAILED';
        }

        footnote.insertionPoints.item(-1).contents = referenceText;

        /* Restore the caret to the main story after the marker for repeated insertions. */
        try {
            var marker = footnote.storyOffset;
            if (marker && marker.isValid) {
                var markerIndex = Number(marker.index);
                story = doc.stories.itemByID(storyId);
                if (story && story.isValid) {
                    var nextIndex = markerIndex + 1;
                    var lastIndex = story.insertionPoints.length - 1;
                    if (nextIndex > lastIndex) nextIndex = lastIndex;
                    if (nextIndex >= 0) app.select(story.insertionPoints.item(nextIndex));
                }
            }
        } catch (restoreError) {
            /* The footnote already exists. A caret-restore failure must not cause fallback paste. */
        }

        return 'QURAN_OK';
    } catch (error) {
        return 'QURAN_ERROR|INSERT_FAILED';
    }
    })();
}, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, 'Insert Quran footnote');
quranFootnoteResult;
