// Copyright (c) Microsoft. All rights reserved. Licensed under the Apache License, Version 2.0. 
// See LICENSE.txt in the project root for complete license information.

module Diff {
    /// <summary>
    ///  Enum indicating what happened to a Segment of text analyzed in a diff.
    /// </summary>
    export enum SegmentType {
        Unchanged,
        Added,
        Removed,
        MovedFrom,
        MovedTo
    }

    export enum UnicodeCategory {
        SpaceSeparator,
        LowercaseLetter
    }

    /// <summary>
    ///  Data structure representing a distinct portion of a body of text passed
    ///  to the diff algorithm. Identifies the content and what happened to it between
    ///  the old and new states of the string diff'd.
    /// </summary>
    export class Segment {
        constructor (public content? = '', public type? = SegmentType.Unchanged) { }
    }

    /// <summary>
    ///  Data structure identifying what happened to a portion of a string passed
    ///  to the diff algorithm. Identifies the index and length in the parent text,
    ///  and what happened to it between the old and new states of the string diff'd.
    /// </summary>
    export class Region {
        constructor (public index: number, public length: number, public type: SegmentType) { }
    }

    /// <summary>
    ///  Represents any subset of the file content. Files are split into
    ///  Chunks for the algorithm to associate.
    /// </summary>
    export class Chunk {
        public hashCode: string;
        public matchingIndex: number;
        public innerDiff: InnerDiff;
        
        constructor (public content: string, public delimiterContent: string) {
            this.hashCode = "~!!" + content; // this will get used as an indexer later, don't want to overwrite useful properties
            this.matchingIndex = -1;
            this.innerDiff = null;
        }

        public mergedContent() {
            return this.content + this.delimiterContent;
        }

        public equals(otherChunk: Chunk): bool {
            if (otherChunk == null) throw new Error("otherChunk is null");

            if (this.hashCode != otherChunk.hashCode) return false;
            return this.content === otherChunk.content;
        }

        static isDelimiter(c: string, delimiters: string[]): bool {
            return delimiters.indexOf(c) >= 0;
        }

        /// <summary>
        ///  Split a string into chunks. Chunks are broken on the delimiter
        ///  to non-delimiter boundary, with delimiters excluded
        /// </summary>
        /// <param name="content">String to parse</param>
        /// <param name="delimiters">Delimiter characters</param>
        /// <returns>Array of chunks broken on delimiter boundaries.</returns>
        static Split(content: string, delimiters: string[]): Chunk[] {
            var set: Chunk[] = [];

            var currentIndex: number, currentLength: number;
            var index = 0;
            var length = content.length;
            var delimiterCount = 0;
            while (index < length) {
                currentIndex = index;
                currentLength = 0;

                //...read until we hit a delimiter
                while (index < length && !isDelimiter(content.substr(index, 1), delimiters)) {
                    currentLength++;
                    index++;
                }

                //...then, read until we get to the last one
                delimiterCount = 0;
                while (index < length && isDelimiter(content.substr(index, 1), delimiters)) {
                    currentLength++;
                    index++;
                    delimiterCount++;
                }

                //...add the new Section to the set
                set.push(new Chunk(content.substr(currentIndex, currentLength - delimiterCount), content.substr(currentIndex + currentLength - delimiterCount, delimiterCount)));
            }

            return set;
        }

        /// <summary>
        ///  Split a string into chunks. Chunks are broken on the delimiter
        ///  / non-delimiter boundaries, so each contains non-delimiters or delimiters.
        /// </summary>
        /// <param name="content">String to parse</param>
        /// <param name="delimiters">Delimiter characters</param>
        /// <returns>Array of chunks broken on delimiter boundaries.</returns>
        static SplitSeparateDelimiters(content: string, delimiters: string[]): Chunk[] {
            if (content == null || content.length == 0) return [];
            var set: Chunk[] = [];
            var wantDelimiter = isDelimiter(content[0], delimiters);

            var currentIndex: number, currentLength: number;
            var index = 0;
            var length = content.length;
            while (index < length) {
                currentIndex = index;
                currentLength = 0;

                //...read until we hit a delimiter boundary
                while (index < length && wantDelimiter == isDelimiter(content[index], delimiters)) {
                    currentLength++;
                    index++;
                }

                //...now we're looking for the opposite character type
                wantDelimiter = !wantDelimiter;

                //...add the new Section to the set
                set.push(new Chunk(content.substr(currentIndex, currentLength), ''));
            }

            return set;
        }

        
        static SplitInner(content: string): Chunk[] {
            //return SplitSeparateDelimiters(content, new char[] { ' ', '\t', '=', ':', ';', ',', '\r', '\n' });
            return SplitCategory(content);
        }


        /// <summary>
        ///  Split method which breaks each chunk on Unicode character
        ///  category boundaries. It uses some modifications to the raw
        ///  Unicode categories to cluster logical parts of lines more
        ///  effectively.
        /// </summary>
        /// <param name="content">String to Split</param>
        /// <returns>Chunk array broken up on Unicode category boundaries</returns>
        static SplitCategory(content: string): Chunk[] {
            if (content == null || content.length == 0) return [];

            var set: Chunk[] = [];
            var categoryToMatch = GetCategory(content[0]);

            var currentIndex: number, currentLength: number;
            var index = 0;
            var length = content.length;
            while (index < length) {
                //...start with a length 1 string at this index
                currentIndex = index;
                currentLength = 1;
                index++;

                //...read until we hit a boundary
                while (index < length && CategoryMatches(GetCategory(content[index]), categoryToMatch)) {
                    currentLength++;
                    index++;
                }

                //...swap what we're looking for
                if (index < length) categoryToMatch = GetCategory(content[index]);

                //...add the new Section to the set
                set.push(new Chunk(content.substr(currentIndex, currentLength), ''));
            }

            return set;
        }

        static CategoryMatches(left: UnicodeCategory, right: UnicodeCategory): bool {
            // Spacing never matches. This causes each space to be broken up
            if (left == UnicodeCategory.SpaceSeparator || right == UnicodeCategory.SpaceSeparator) return false;

            return left == right;
        }

        /// <summary>
        ///  Similar to Char.GetUnicodeCategory, but lumps a few together for better
        ///  breakdowns. (Upper and lower case characters, for example)
        /// </summary>
        /// <param name="c">Char to classify</param>
        /// <returns>UnicodeCategory of the char (with some modifications)</returns>
        static GetCategory(c: string): UnicodeCategory {
            if (c === ' ' || c === '\r' || c === '\n' || c === '\t') {
                return UnicodeCategory.SpaceSeparator;
            } else {
                return UnicodeCategory.LowercaseLetter;
            }
        }

        static SplitEveryChar(content: string): Chunk[] {
            var set: Chunk[] = [];
            for (var i = 0; i < content.length; ++i) {
                set.push(new Chunk(content[i], ''));
            }

            return set;
        }

        public toString(): string {
            // return this.MatchingIndex.ToString("0000") + "  " + Content;
            return 'NYI?';
        }
    }

    class UniquenessEntry {
        public MatchCount: number;

        constructor (public index: number, public content: string) {
            this.MatchCount = 1;
        }

        public equals(other: UniquenessEntry) {
            return this.content == other.content;
        }

        public Increment() {
            this.MatchCount++;
        }
    }

    class SegmentBuilder {
        private segmentSet: Segment[];
        private currentContent: string;
        private currentType: SegmentType;
        private segmentExists: bool;

        constructor () {
            this.segmentSet = [];
        }

        public AddSegment(content: string, type: SegmentType) {
            // Check the new chunk to add against the current segment we're holding...
            if (this.segmentExists && this.currentType == type) {
                //...if the type is the same, lump them together
                this.currentContent += content;
            }
            else {
                //...if the type is different...

                //...add the current segment (if any) to the set
                if (this.segmentExists) {
                    var currentSegment = new Segment();
                    currentSegment.content = this.currentContent;
                    currentSegment.type = this.currentType;
                    this.segmentSet.push(currentSegment);
                }

                //...create a new segment for this chunk
                this.segmentExists = true;
                this.currentContent = content;
                this.currentType = type;
            }
        }

        private FlushSegment() {
            if (this.segmentExists) {
                this.segmentExists = false;
                var currentSegment = new Segment();
                currentSegment.content = this.currentContent;
                currentSegment.type = this.currentType;
                this.segmentSet.push(currentSegment);
            }
        }

        public GetSegments() {
            this.FlushSegment();
            return this.segmentSet;
        }
    }

    export class InnerDiff {
        public Segments: Segment[];

        constructor (oldContent: string, newContent: string) {
            var oldChunks = Chunk.SplitInner(oldContent);
            var newChunks = Chunk.SplitInner(newContent);

            StringDiff.Compare(oldChunks, 0, oldChunks.length - 1, newChunks, 0, newChunks.length - 1);

            this.Segments = StringDiff.CompressArraysToSegments(oldChunks, newChunks);
        }
    }

    export class StringDiff {
        private segmentSet: Segment[];

        // Strings and Regions mode fields
        private regionsGenerated: bool;
        public mergedHtml: string;
        public mergedOutput: string;
        public oldOutput: string;
        public newOutput: string;
        public regions: Region[];

        constructor (oldContent: string, newContent: string) {
            this.regionsGenerated = false;
            this.segmentSet = [];

            var delimitersToUse = '\n\r';
            var useNestedAlgorithm = true;

            var oldChunks = Chunk.Split(oldContent, delimitersToUse.split(''));
            var newChunks = Chunk.Split(newContent, delimitersToUse.split(''));

            StringDiff.Compare(oldChunks, 0, oldChunks.length - 1, newChunks, 0, newChunks.length - 1);
            if (useNestedAlgorithm) StringDiff.PerformNestedDiff(oldChunks, newChunks);

            this.segmentSet = StringDiff.CompressArraysToSegments(oldChunks, newChunks);

            this.GenerateStringsAndRegions();
        }

        static Compare(oldContent: Chunk[], oldStart: number, oldEnd: number, newContent: Chunk[], newStart: number, newEnd: number): void {
            //...add all old and new chunks to uniqueness Hashtables
            var oldTable = BuildUniquenessTable(oldContent, oldStart, oldEnd);
            var newTable = BuildUniquenessTable(newContent, newStart, newEnd);

            //...associate unique lines with each other
            for (var i = newStart; i <= newEnd; ++i) {
                var newEntries = <UniquenessEntry[]>(newTable[newContent[i].hashCode]);
                var oldEntries = <UniquenessEntry[]>(oldTable[newContent[i].hashCode]);

                if (newEntries && oldEntries) {
                    var foundIt = false;
                    for (var x = 0; x < newEntries.length; x++) {
                        var newEntry = newEntries[x];
                        for (var y = 0; y < oldEntries.length; y++) {
                            var oldEntry = oldEntries[y];

                            if (newEntry && oldEntry && newEntry.MatchCount == 1 && oldEntry.MatchCount == 1 && (newEntry.content.localeCompare(oldEntry.content) === 0)) {
                                var oldIndex = oldEntry.index;
                                newContent[i].matchingIndex = oldIndex;
                                oldContent[oldIndex].matchingIndex = i;
                                foundIt = true;
                                break;
                            }
                        }
                        if(foundIt) break;
                    }
                }
            }

            //...check the first and last lines from each side
            if (oldStart <= oldEnd && newStart <= newEnd) {
                TryMatch(oldContent, oldStart, newContent, newStart);
                TryMatch(oldContent, oldEnd, newContent, newEnd);
            }

            //...add lines after matching lines
            for (var i = newStart; i < newEnd; ++i) {
                var j = newContent[i].matchingIndex;

                //...if we have a matching index for the other side...
                if (j != -1 && j < oldEnd && j >= oldStart) {
                    //...AND that index points back to us...
                    if (oldContent[j].matchingIndex == i) {
                        //...TRY matching the next chunks with each other
                        TryMatch(oldContent, j + 1, newContent, i + 1);
                    }
                }
            }

            //...add lines before matching lines
            for (var i = newEnd; i > newStart; --i) {
                var j = newContent[i].matchingIndex;

                //...if we have a matching index for the other side...
                if (j != -1 && j <= oldEnd && j > oldStart) {
                    //...AND that index points back to us...
                    if (oldContent[j].matchingIndex == i) {
                        //...TRY matching the previous chunks with each other
                        TryMatch(oldContent, j - 1, newContent, i - 1);
                    }
                }
            }
        }

        static TryMatch(oldContent: Chunk[], oldIndex: number, newContent: Chunk[], newIndex: number): void {
            var newChunk = newContent[newIndex];
            var oldChunk = oldContent[oldIndex];

            //...if these are not already matched up
            if (newChunk.matchingIndex == -1 && oldChunk.matchingIndex == -1) {
                //...AND the chunks match...
                if (newChunk.content === oldChunk.content) {
                    //...THEN point those chunks to each other
                    newChunk.matchingIndex = oldIndex;
                    oldChunk.matchingIndex = newIndex;
                }
            }
        }

        static BuildUniquenessTable(content: Chunk[], start: number, end: number): any {
            //...add all chunks to a uniqueness Hashtable
            var table: any = {};
            for (var i = start; i <= end; ++i) {
                var entries: UniquenessEntry[] = table[content[i].hashCode];
                if (entries == null) {
                    entries = [];
                }

                var hasMatch = false;
                for (var k = 0; k < entries.length; k++) {
                    if (entries[k].content.localeCompare(content[i].content) === 0) {
                        hasMatch = true;
                        entries[k].Increment();
                        break;
                    }
                }

                if (!hasMatch) {
                    var newEntry = new UniquenessEntry(i, content[i].content);
                    entries.push(newEntry);
                }

                table[content[i].hashCode] = entries;
            }

            return table;
        }

        static PerformNestedDiff(oldContent: Chunk[], newContent: Chunk[]): void {
            //...check the first and last lines from each side
            if (oldContent.length > 0 && newContent.length > 0) {
                TryInnerMatch(oldContent, 0, newContent, 0);
                TryInnerMatch(oldContent, oldContent.length - 1, newContent, newContent.length - 1);
            }

            //...add lines after matching lines
            for (var i = 0; i < newContent.length - 1; ++i) {
                var j = newContent[i].matchingIndex;

                //...if we have a matching index for the other side...
                if (j != -1 && j < oldContent.length - 1 && j >= 0) {
                    //...AND that index points back to us...
                    if (oldContent[j].matchingIndex == i) {
                        //...TRY inner comparison (will map indexes if it works)
                        TryInnerMatch(oldContent, j + 1, newContent, i + 1);
                    }
                }
            }

            //...add lines before matching lines
            for (var i = newContent.length - 1; i > 0; --i) {
                var j = newContent[i].matchingIndex;

                //...if we have a matching index for the other side...
                if (j != -1 && j < oldContent.length && j > 0) {
                    //...AND that index points back to us...
                    if (oldContent[j].matchingIndex == i) {
                        //...TRY inner comparison (will map indexes if it works)
                        TryInnerMatch(oldContent, j - 1, newContent, i - i);
                    }
                }
            }
        }

        static TryInnerMatch(oldContent: Chunk[], oldIndex: number, newContent: Chunk[], newIndex: number): void {
            var newChunk = newContent[newIndex];
            var oldChunk = oldContent[oldIndex];

            //...if these are not already matched up
            if (newChunk.matchingIndex == -1 && oldChunk.matchingIndex == -1) {
                //...AND the chunks match...
                var difference = new InnerDiff(oldContent[oldIndex].content, newContent[newIndex].content);
                if (AreSimilarEnough(difference)) {
                    //...THEN point those chunks to each other
                    newChunk.innerDiff = difference;
                    oldChunk.innerDiff = difference;

                    newChunk.matchingIndex = oldIndex;
                    oldChunk.matchingIndex = newIndex;
                }
            }
        }

        /// <summary>
        ///  Decide whether two chunks matched with the inner algorithm were
        ///  similar enough to consider associated.
        /// </summary>
        /// <param name="difference">The diff result of the comparison</param>
        /// <returns>True if they are similar enough to map, False otherwise</returns>
        static AreSimilarEnough(difference: InnerDiff): bool {
            var identicalChars = 0;
            var differentChars = 0;

            var addedCount = 0;
            var removedCount = 0;
            var movedCount = 0;

            for (var i = 0; i < difference.Segments.length; i++) {
                var s = difference.Segments[i];
                //...count segments by type
                switch (s.type) {
                    case SegmentType.Added:
                        addedCount++; break;
                    case SegmentType.Removed:
                        removedCount++; break;
                    case SegmentType.MovedFrom:
                        movedCount++; break;
                    case SegmentType.MovedTo:
                        movedCount++; break;
                }

                //...skip counting whitespace only segments
                if (s.content.trim().length == 0) continue;

                //...count the characters. I double the unchanged length because moved sections and removed/added sections come in pairs and count twice.
                if (s.type == SegmentType.Unchanged)
                    identicalChars += s.content.length * 2;
                else
                    differentChars += s.content.length;
            }

            var totalChars = identicalChars + differentChars;

            // Empty lines match
            if (totalChars == 0) return true;

            // Lines which are added/unchanged or removed/unchanged only match
            if (removedCount == 0 && movedCount == 0) return true;
            if (addedCount == 0 && movedCount == 0) return true;

            // Lines with enough identical characters match
            return (identicalChars / totalChars) > 0.50;
        }

        static CompressArraysToSegments(oldContent: Chunk[], newContent: Chunk[]): Segment[] {
            // Now, generate Segments for the chunks in the two arrays
            var builder = new SegmentBuilder();

            // Start at the beginning of both versions of the content
            var oldIndex = 0;
            var newIndex = 0;

            // Loop while there is remaining content in both files
            while (oldIndex < oldContent.length && newIndex < newContent.length) {
                if (oldContent[oldIndex].matchingIndex == newIndex) {
                    // Matching chunks - output as-is
                    if (newContent[newIndex].innerDiff == null) {
                        builder.AddSegment(newContent[newIndex].mergedContent(), SegmentType.Unchanged);

                        // No range diff for unchanged
                        //rBuilder.Append(newIndex, oldIndex);
                    }
                    else {
                        // Diff'd within line - show inner data
                        for (var i = 0; i < newContent[newIndex].innerDiff.Segments.length; i++) {
                            var s = newContent[newIndex].innerDiff.Segments[i];
                            builder.AddSegment(s.content, s.type);
                        }
                    }

                    oldIndex++; newIndex++;
                }
                else if (oldContent[oldIndex].matchingIndex == -1) {
                    // Removed chunks - add to output
                    builder.AddSegment(oldContent[oldIndex].mergedContent(), SegmentType.Removed);
                    oldIndex++;
                }
                else if (newContent[newIndex].matchingIndex == -1) {
                    // Added chunks - add to output
                    builder.AddSegment(newContent[newIndex].mergedContent(), SegmentType.Added);
                    newIndex++;
                }
                else if (oldContent[oldIndex].matchingIndex < newIndex) {
                    // Content moved up - it was removed from here
                    builder.AddSegment(oldContent[oldIndex].mergedContent(), SegmentType.MovedFrom);
                    oldIndex++;
                }
                else if (newContent[newIndex].matchingIndex < oldIndex) {
                    // Content moved down - it was added here
                    builder.AddSegment(newContent[newIndex].mergedContent(), SegmentType.MovedTo);
                    newIndex++;
                }
                else {
                    // Moved content; need to decide whether to express as a move up or down.
                    // Choose the one which will get us aligned again most quickly.

                    // How many lines on the left/right would I need to output before things line up again?
                    var linesOnLeftBeforeUnchanged = newContent[newIndex].matchingIndex - oldIndex;
                    var linesOnRightBeforeUnchanged = oldContent[oldIndex].matchingIndex - newIndex;

                    // Output on the side that will get us back to unchanged first
                    if (linesOnLeftBeforeUnchanged < linesOnRightBeforeUnchanged) {
                        // Treat as Move Down
                        builder.AddSegment(oldContent[oldIndex].mergedContent(), SegmentType.MovedFrom);
                        //dBuilder.Append(oldContent[oldIndex].MatchingIndex, oldIndex);
                        oldIndex++;
                    }
                    else {
                        // Treat as Move Up
                        builder.AddSegment(newContent[newIndex].mergedContent(), SegmentType.MovedTo);
                        //dBuilder.Append(newIndex, newContent[newIndex].MatchingIndex);
                        newIndex++;
                    }
                }
            }

            // If there is remaining content in the old file, emit it
            while (oldIndex < oldContent.length) {
                if (oldContent[oldIndex].matchingIndex == -1) {
                    builder.AddSegment(oldContent[oldIndex].mergedContent(), SegmentType.Removed);
                    //dBuilder.Append(-1, oldIndex);
                }
                else {
                    builder.AddSegment(oldContent[oldIndex].mergedContent(), SegmentType.MovedFrom);
                    //dBuilder.Append(oldContent[oldIndex].MatchingIndex, oldIndex);
                }

                oldIndex++;
            }

            // If there is remaining content in the new file, emit it
            while (newIndex < newContent.length) {
                if (newContent[newIndex].matchingIndex == -1) {
                    builder.AddSegment(newContent[newIndex].mergedContent(), SegmentType.Added);
                    //dBuilder.Append(newIndex, -1);
                }
                else {
                    builder.AddSegment(newContent[newIndex].mergedContent(), SegmentType.MovedTo);
                    //dBuilder.Append(newIndex, newContent[newIndex].MatchingIndex);
                }
                newIndex++;
            }

            //dBuilder.Flush();
            //diff = dBuilder.FileDiff;

            return builder.GetSegments();
        }

        private GenerateStringsAndRegions(): void {
            if (this.regionsGenerated === false) {
                this.regionsGenerated = true;
                var MergedHtml = '';
                var MergedText = '';
                var OldText = '';
                var NewText = '';
                var Regions: Region[] = [];

                MergedHtml += StringDiff.htmlPrefix();

                for (var i = 0; i < this.segmentSet.length; i++) {
                    var segment = this.segmentSet[i];

                    var newRegion = new Region(MergedText.length, segment.content.length, segment.type);

                    Regions.push(newRegion);
                    MergedText += segment.content;

                    switch (segment.type) {
                        case SegmentType.Added:
                            OldText += (StringDiff.whitespaceEquivalent(segment.content));
                            NewText += (segment.content);
                            MergedHtml += (StringDiff.addedStringHtml(segment.content));
                            break;
                        case SegmentType.MovedTo:
                            OldText += (StringDiff.whitespaceEquivalent(segment.content));
                            NewText += (segment.content);
                            MergedHtml += (StringDiff.movedToStringHtml(segment.content));
                            break;
                        case SegmentType.Removed:
                            OldText += (segment.content);
                            NewText += (StringDiff.whitespaceEquivalent(segment.content));
                            MergedHtml += (StringDiff.removedStringHtml(segment.content));
                            break;
                        case SegmentType.MovedFrom:
                            OldText += (segment.content);
                            NewText += (StringDiff.whitespaceEquivalent(segment.content));
                            MergedHtml += (StringDiff.movedFromStringHtml(segment.content));
                            break;
                        default:
                            OldText += (segment.content);
                            NewText += (segment.content);
                            MergedHtml += (StringDiff.unchangedStringHtml(segment.content));
                            break;
                    }
                }

                MergedHtml += StringDiff.htmlSuffix();

                this.mergedHtml = MergedHtml;
                this.mergedOutput = MergedText;
                this.oldOutput = OldText;
                this.newOutput = NewText;
                this.regions = Regions;
            }
        }

        static htmlPrefix(): string {
            var content = '';

            /*
            content += ("<style>");
            content += '\r\n' + (".all { font: 9pt 'Courier New'; }");
            content += '\r\n' + (".old { background-color: #FF0000; }");
            content += '\r\n' + (".new { background-color: #FFFF00; }");
            content += '\r\n' + (".from { background-color: #FF0000; color: #0000FF; }");
            content += '\r\n' + (".to { background-color: #FFFF00; color: #0000FF; }");
            content += '\r\n' + ("</style>");
    
            content += '\r\n' + ("<div class=\"all\">");
            */
            return content;
        }

        static htmlSuffix(): string {
            /*
            return '</div>';
            */
            return '';
        }

        static addedStringHtml(text: string) {
            return "<span class=\"new\">" + fullHtmlEncode(text) + "</span>";
        }

        static removedStringHtml(text: string) {
            return "<span class=\"old\">" + fullHtmlEncode(text) + "</span>";
        }

        static movedFromStringHtml(text: string) {
            return "<span class=\"from\">" + fullHtmlEncode(text) + "</span>";
        }

        static movedToStringHtml(text: string) {
            return "<span class=\"to\">" + fullHtmlEncode(text) + "</span>";
        }

        static unchangedStringHtml(text: string) {
            return fullHtmlEncode(text);
        }

        static fullHtmlEncode(text: string) {
            return text.replace('<', '&lt;').replace(/\n/g, '<br>').replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
        }

        static whitespaceEquivalent(input: string): string {
            // TODO: Don't replace \r, \n, or \t
            return input.replace(/./g, ' ');
        }
    }
}

/* Debug code for use in Node */
/*
var htmlLeader = '<html><head><title>Baseline Report</title>';
htmlLeader += ("<style>");
htmlLeader += '\r\n' + (".code { font: 9pt 'Courier New'; }");
htmlLeader += '\r\n' + (".old { background-color: #EE1111; }");
htmlLeader += '\r\n' + (".new { background-color: #FFFF11; }");
htmlLeader += '\r\n' + (".from { background-color: #EE1111; color: #1111EE; }");
htmlLeader += '\r\n' + (".to { background-color: #EEEE11; color: #1111EE; }");
htmlLeader += '\r\n' + ("h2 { margin-bottom: 0px; }");
htmlLeader += '\r\n' + ("h2 { padding-bottom: 0px; }");
htmlLeader += '\r\n' + ("h4 { font-weight: normal; }");
htmlLeader += '\r\n' + ("</style>");

declare var require, process;
function read(path) {
    var _fs = require('fs');
    return _fs.readFileSync(path).toString()
}

var leftFile = read(process.argv[2]);
var rightFile = read(process.argv[3]);

var diff = new Diff.StringDiff(leftFile, rightFile);
console.log(htmlLeader + '</head><body>' + diff.mergedHtml + '</body></html>');
*/