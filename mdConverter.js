
const markdownConvertersFromZenkitClient = (function () {
    var toMarkdownTableConverter = {
        filter: 'table',
        replacement: function (content) {
            // Remove linebreaks and <thead></thead> tags
            content = content.replace(/\n/g, '');
            content = content.replace(/<thead>|<\/thead>/gi, '');
            // Count number of <th> tags and remove them. Then replace the first </tr> with
            // number of th tags times | ------------- |
            // Remove first <tr> and replace subsequent <tr> with linebreaks
            // remove <tbody></tbody> tags
            // remove first tr tag and replace rest with new lines
            // Replace remaining </tr> and <td> tags with | and remove all </td> tags
            var numberOfHeaders = content.match(/<th[^<>]*>/gi).length;
            content = content.replace(/<th>/gi, '|');
            content = content.replace(/<\/th>/gi, '');

            content = content.replace(/<\/tr>/i, function () {
                var tableHeaderUnderlines = '|\n|';
                for (var i = 0; i < numberOfHeaders; i++) {
                    tableHeaderUnderlines += ' ------------- |';
                }
                return tableHeaderUnderlines;
            });

            content = content.replace(/<tbody>|<\/tbody>/gi, '');
            content = content.replace(/<tr>/i, '');
            content = content.replace(/<tr>/gi, '\n');
            content = content.replace(/<\/tr>|<td>/gi, '|');
            content = content.replace(/<\/td>/gi, '');

            return content;
        }
    };

    // This is needed, because the standard converter adds an empty new line after headings.
    // This leads to inconsistent styling and too much whitespace, so we replace the replacement
    // with our own function
    var toMarkdownHeadingConverter = {
        filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        replacement: function (innerHTML, node) {
            var hLevel = node.tagName.charAt(1);
            var hPrefix = '';
            for (var i = 0; i < hLevel; i++) {
                hPrefix += '#';
            }
            return hPrefix + ' ' + innerHTML + '\n';
        }
    };

    // This is needed to support our <a zenkit-inline> attribute.
    // Those links should not be converted to markdown.
    var toMarkdownLinkConverter = {
        filter: 'a',
        replacement: function (innerHTML, node) {
            var href = _.get(node, ['attributes', 'href', 'value']);
            var title = _.get(node, ['attributes', 'title', 'value']);
            var zenkitInline = _.get(node, ['attributes', 'zenkit-inline', 'specified'], false);
            if (zenkitInline) {
                return node.outerHTML;
            }
            return '[' + innerHTML + (title ? ' | ' + title : '') + '](' + href + ')';
        }
    };

    return [
        toMarkdownTableConverter,
        toMarkdownHeadingConverter,
        toMarkdownLinkConverter
    ];
}());

// We are using the deprecated 'to-markdown' to be consistent with the rest of the app
// and plug-and-play the existing converters
const toMarkdown = new require('to-markdown');

module.exports.convertHTMLToMarkdown = htmlString => toMarkdown(htmlString, markdownConvertersFromZenkitClient);