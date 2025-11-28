/**
 * Simple Markdown Parser
 * Converts markdown text to HTML for display in the result overlay
 */

function parseMarkdown(text) {
    if (!text) return '';

    let html = text;

    // Escape HTML special characters first (except for parts we'll convert)
    html = html.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (```language\ncode\n```)
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, function (match, language, code) {
        const lang = language ? ` class="language-${language}"` : '';
        return `<pre><code${lang}>${code.trim()}</code></pre>`;
    });

    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers (# H1, ## H2, etc.)
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic (*text* or _text_)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Strikethrough (~~text~~)
    html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Links ([text](url))
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Unordered lists (- item or * item)
    html = html.replace(/^\s*[-*]\s+(.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Ordered lists (1. item)
    html = html.replace(/^\s*\d+\.\s+(.+)$/gim, '<li>$1</li>');
    // Wrap consecutive <li> in <ol> if not already wrapped
    html = html.replace(/(<li>(?:(?!<ul>|<ol>).)*<\/li>)/gs, function (match) {
        if (!match.includes('<ul>') && !match.includes('<ol>')) {
            return '<ol>' + match + '</ol>';
        }
        return match;
    });

    // Blockquotes (> text)
    html = html.replace(/^&gt;\s+(.+)$/gim, '<blockquote>$1</blockquote>');

    // Horizontal rules (---, ***, ___)
    html = html.replace(/^(?:---|___|\*\*\*)$/gim, '<hr>');

    // Line breaks (two spaces at end of line or \n)
    html = html.replace(/  \n/g, '<br>');
    html = html.replace(/\n/g, '<br>');

    return html;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMarkdown };
}