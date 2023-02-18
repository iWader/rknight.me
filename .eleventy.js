const pluginRss = require("@11ty/eleventy-plugin-rss");
const util = require('util')
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight")
const marked = require('marked')
const { DateTime } = require("luxon")
const EleventyPluginOgImage = require('eleventy-plugin-og-image')
const fs = require('fs')
const sanitizeHTML = require('sanitize-html')
const { execSync } = require('child_process')

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/files");
  eleventyConfig.addPassthroughCopy("src/favicon.ico");

  eleventyConfig.addPlugin(pluginRss);
  eleventyConfig.addPlugin(syntaxHighlight);

  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);
  eleventyConfig.addShortcode("timestamp", () => Date.now());

  eleventyConfig.addCollection("posts", function(collection) {
    return collection.getFilteredByGlob("src/posts/**/*.md").reverse()
  });

  eleventyConfig.addCollection("shortcuts", function(collection) {
    return collection.getFilteredByGlob("src/posts/**/*.md").reverse().filter(p => {
        return p.data.title.toLowerCase().includes('shortcut')
    })
  })

  eleventyConfig.addFilter('console', function(value) {
    const str = util.inspect(value);
    return `<div style="white-space: pre-wrap;">${unescape(str)}</div>;`
  });

  eleventyConfig.addFilter('getYouTubeLinks', function(post) {
    if (!post.links || post.links.length === 0)
    {
        return []
    }

    const youtubeIds = []

    post.links.forEach(l => {
        const matches = l.match(/(http:|https:)?\/\/(www\.)?(youtube.com|youtu.be)\/(watch)?(\?v=)?(\S+)?/)
        if (matches && matches[6])
        {
            youtubeIds.push(matches[6])
        }
    })

    return youtubeIds
  })

  eleventyConfig.addCollection("firstPosts", function(collection) {
    return collection.getFilteredByGlob("src/posts/**/*.md").reverse().slice(0, 10)
  });

  eleventyConfig.addFilter('imageLink', function(path) {
    if (path.startsWith("https://rknightuk.s3.amazonaws.com")) return path
      return `https://rknightuk.s3.amazonaws.com/${path}`;
  })

  eleventyConfig.addFilter('redirectHashtags', function(content) {
    return content.replaceAll('https://social.lol/tags/', '/tags/')
  })

  eleventyConfig.addFilter("trim", function(string, limit) {
    return string.length <= limit ? string : `${string.slice(0, limit)}...`
  })

  eleventyConfig.addFilter('getFirstAttachment', function(post) {
    if (post && post.attachments && post.attachments.length > 0)
    {
        return post.attachments[0].url ? post.attachments[0].url : post.attachments[0]
    }

    return 'https://rknight.me/assets/img/preview.png'
  })

  eleventyConfig.addFilter('postPath', function(path) {
    if (path.includes('micro/')) return path
      return `/micro/${path}`;
  })

  eleventyConfig.addFilter("isoDateOnly", function(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  })

  eleventyConfig.addFilter('dateForFeed', function(date) {
    return new Date(date).toISOString()
  })

  eleventyConfig.addFilter("toDateTime", function(date) {
    const formatted = DateTime.fromISO(date)

    const trail = (number) => {
        return parseInt(number, 10) < 10 ? `0${number}` : number
    }

    return `${formatted.year}-${trail(formatted.month)}-${trail(formatted.day)} ${trail(formatted.hour)}:${trail(formatted.minute)}`
  })

  eleventyConfig.addFilter("toDateTimeFromUnix", function(date) {
    const formatted = DateTime.fromSeconds(parseInt(date, 10))

    const trail = (number) => {
        return parseInt(number, 10) < 10 ? `0${number}` : number
    }

    return `${formatted.year}-${trail(formatted.month)}-${trail(formatted.day)} ${trail(formatted.hour)}:${trail(formatted.minute)}`
  })

  eleventyConfig.addFilter('stripIndex', function(path) {
    return path.replace('/index.html', '/');
  })

  eleventyConfig.addFilter('mdToHtml', function(content) {
    return marked.parse(content)
  })

  eleventyConfig.addPlugin(EleventyPluginOgImage, {
    generateHTML: (outputUrl) => {
        return `<meta property="og:image" content="https://rknight.me${outputUrl}" />`
    },
    satoriOptions: {
      fonts: [
        {
          name: 'Bayshore',
          data: fs.readFileSync('src/assets/Bayshore.woff'),
          weight: 700,
          style: 'normal',
        },
        {
          name: 'Atkinson Hyperlegible',
          data: fs.readFileSync('src/assets/Atkinson-Hyperlegible-Bold-102.woff'),
          weight: 700,
          style: 'normal',
        },
      ],
    },
  })

  eleventyConfig.addFilter('webmentionsByUrl', function(webmentions, url) {
    const allowedTypes = ['mention-of', 'in-reply-to', 'like-of', 'repost-of']

    const data = {
        'like-of': [],
        'repost-of': [],
        'in-reply-to': [],
    }

    const hasRequiredFields = entry => {
        const { author, published, content } = entry
        return author.name && published && content
    }

    const filtered = webmentions
        .filter(entry => entry['wm-target'] === `https://rknight.me${url}`)
        .filter(entry => allowedTypes.includes(entry['wm-property']))

    filtered.forEach(m => {
        if (data[m['wm-property']])
        {
            const isReply = m['wm-property'] === 'in-reply-to'
            const isValidReply = isReply && hasRequiredFields(m)
            if (isReply)
            {
                if (isValidReply)
                {
                    m.sanitized = sanitizeHTML(m.content.html)
                    data[m['wm-property']].unshift(m)
                }

                return
            }

            data[m['wm-property']].unshift(m)
        }
    })

    data['in-reply-to'].sort((a,b) => (a.published > b.published) ? 1 : ((b.published > a.published) ? -1 : 0))

    return data
  })

  eleventyConfig.on('eleventy.after', () => {
    execSync(`npx pagefind --source public --glob \"**/*.html\"`, { encoding: 'utf-8' })
  })

  return {
    passthroughFileCopy: true,
    dir: {
      input: "src",
      output: "public"
    }
  };
};
