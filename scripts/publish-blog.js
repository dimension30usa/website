const fs = require('fs');
const path = require('path');

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const issue = event.issue;
const trustedAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

if (!issue || !trustedAssociations.has(issue.author_association)) {
  console.log('Ignoring a blog request from an account without repository access.');
  process.exit(0);
}

function field(label) {
  const escaped = label.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const match = (issue.body || '').match(new RegExp('### ' + escaped + '\\s*\\n+([\\s\\S]*?)(?=\\n### |$)'));
  if (!match) return '';
  const value = match[1].trim();
  return value === '_No response_' ? '' : value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function inlineMarkdown(value) {
  let safe = escapeHtml(value);
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
  safe = safe.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return safe;
}

function renderArticle(markdown) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const output = [];
  let paragraph = [];
  let listOpen = false;

  function closeParagraph() {
    if (paragraph.length) {
      output.push('        <p>' + paragraph.map(inlineMarkdown).join('<br>') + '</p>');
      paragraph = [];
    }
  }

  function closeList() {
    if (listOpen) {
      output.push('        </ul>');
      listOpen = false;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph();
      closeList();
    } else if (/^#{2,3}\s*/.test(trimmed)) {
      closeParagraph();
      closeList();
      const level = trimmed.startsWith('### ') ? 3 : 2;
      output.push('        <h' + level + '>' + inlineMarkdown(trimmed.replace(/^#{2,3}\s*/, '')) + '</h' + level + '>');
    } else if (/^>\s?/.test(trimmed)) {
      closeParagraph();
      closeList();
      output.push('        <blockquote>' + inlineMarkdown(trimmed.replace(/^>\s?/, '')) + '</blockquote>');
    } else if (/^[-*]\s+/.test(trimmed)) {
      closeParagraph();
      if (!listOpen) {
        output.push('        <ul>');
        listOpen = true;
      }
      output.push('          <li>' + inlineMarkdown(trimmed.replace(/^[-*]\s+/, '')) + '</li>');
    } else {
      closeList();
      paragraph.push(trimmed);
    }
  }

  closeParagraph();
  closeList();
  return output.join('\n');
}

const title = issue.title.replace(/^\[Blog\]\s*/, '').replace(/^Title:\s*/i, '').trim();
const category = field('Category') || 'Journal';
const summary = field('Short description');
const article = field('Article');
const imageField = field('Featured image (optional)');
const date = (issue.created_at || new Date().toISOString()).slice(0, 10);

if (!title || !summary || !article) {
  throw new Error('The title, short description and article are required.');
}

let slug = title.toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 70);

if (!slug) slug = 'journal-post-' + issue.number;

fs.mkdirSync('posts', { recursive: true });
let filename = date + '-' + slug + '.html';
if (fs.existsSync(path.join('posts', filename))) {
  filename = date + '-' + slug + '-' + issue.number + '.html';
}

const imageMatch = imageField.match(/https:\/\/[^\s)]+/);
const imageUrl = imageMatch ? imageMatch[0].replace(/[>"']/g, '') : '';
const readableDate = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC'
});
const wordCount = article.trim().split(/\s+/).length;
const readingTime = Math.max(1, Math.ceil(wordCount / 220));

const featuredImage = imageUrl
  ? '      <img class="article-featured-image" src="' + escapeHtml(imageUrl) + '" alt="">\n'
  : '';

const post = '<!DOCTYPE html>\n' +
'<html lang="en">\n<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <meta name="description" content="' + escapeHtml(summary) + '">\n' +
'  <title>' + escapeHtml(title) + ' | Dimension 30</title>\n' +
'  <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">\n' +
'  <link rel="stylesheet" href="../style.css">\n' +
'</head>\n<body>\n' +
'  <header class="page-header">\n' +
'    <a class="brand" href="../index.html" aria-label="Dimension 30 home">\n' +
'      <span class="brand-mark"><img src="../image0.png" alt="Dimension 30 logo"></span>\n' +
'      <span class="brand-name">Dimension 30</span>\n' +
'    </a>\n' +
'    <nav class="page-nav"><a class="hide-mobile" href="../blog.html">Journal</a><a class="nav-cta" href="../index.html#contact">Book a Session</a></nav>\n' +
'  </header>\n' +
'  <main><article class="article-shell">\n' +
'      <p class="section-kicker">' + escapeHtml(category) + '</p>\n' +
'      <h1>' + escapeHtml(title) + '</h1>\n' +
'      <p class="article-meta">By Anurag Datta · ' + readableDate + ' · ' + readingTime + ' min read</p>\n' +
featuredImage +
'      <div class="article-body">\n' + renderArticle(article) + '\n      </div>\n' +
'  </article></main>\n' +
'  <footer><div><strong>Dimension 30</strong><span>Awareness · Alignment · Embodiment</span></div>\n' +
'    <p>Holistic coaching and spiritual guidance are not substitutes for medical, psychological, legal or financial care.</p>\n' +
'    <div class="footer-links"><a href="../blog.html">Journal</a><a href="../index.html#contact">Book a Session</a><span>© <span id="year"></span> Dimension 30</span></div>\n' +
'  </footer>\n<script>document.getElementById("year").textContent = new Date().getFullYear();</script>\n' +
'</body>\n</html>\n';

fs.writeFileSync(path.join('posts', filename), post);

const marker = '        <!-- BLOG_POSTS_START -->';
const blogPath = 'blog.html';
let blog = fs.readFileSync(blogPath, 'utf8');

if (!blog.includes(marker)) {
  throw new Error('The Journal publishing marker is missing from blog.html.');
}

const card = marker + '\n\n' +
'        <article class="blog-card">\n' +
'          <div>\n' +
'            <p class="blog-category">' + escapeHtml(category) + '</p>\n' +
'            <h2>' + escapeHtml(title) + '</h2>\n' +
'            <p>' + escapeHtml(summary) + '</p>\n' +
'          </div>\n' +
'          <a href="posts/' + filename + '">Read article →</a>\n' +
'        </article>';

blog = blog.replace(marker, card);
fs.writeFileSync(blogPath, blog);
console.log('Created posts/' + filename);
