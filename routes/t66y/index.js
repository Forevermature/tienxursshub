const cheerio = require('cheerio');
const config = require('../../config');
const axios = require('../../utils/axios');
const iconv = require('iconv-lite');
const url = require('url');

const base = 'http://www.t66y.com';
const section = 'thread0806.php?fid=';
const axios_ins = axios.create({
 headers: {
 'User-Agent': config.ua,
 Referer: base,
 },
 responseType: 'arraybuffer',
});

function killViidii(orginUrl) {
 var decodeStr = /.*\?http/g;
 var decodeSig = /______/g;
 var jsSuffix = '&amp;amp;z';
 var htmlSuffix = '&amp;z';
 var returnSuffix = 'return false';
 if (orginUrl.indexOf('viidii') != -1) {
 var pureUrl = orginUrl.replace(decodeStr, 'http').replace(decodeSig, '.').replace(jsSuffix, '').replace(htmlSuffix, '').replace(returnSuffix, '');
 return pureUrl
 } else {
 return orginUrl;
 }
}

const sourceTimezoneOffset = -8;
const filterReg = /read\.php/;
module.exports = async (ctx) =&gt; {
 const res = await axios_ins.get(url.resolve(base, `${section}${ctx.params.id}`));
 const data = iconv.decode(res.data, 'gbk');
 const $ = cheerio.load(data);
 let list = $('#ajaxtable &gt; tbody:nth-child(2)');
 list = $('.tr2', list)
 .not('.tr2.tac')
 .nextAll();

 const reqList = [];
 const out = [];
 const indexList = []; // New item index
 let skip = 0;

 for (let i = 0; i &lt; Math.min(list.length, 20); i++) {
 const $ = cheerio.load(list[i]);
 let title = $('.tal h3 a');
 const path = title.attr('href');

 // Filter duplicated entries
 if (path.match(filterReg) !== null) {
 skip++;
 continue;
 }
 const link = url.resolve(base, path);

 // Check cache
 const cache = await ctx.cache.get(link);
 if (cache) {
 out.push(JSON.parse(cache));
 continue;
 }

 if (
 cheerio
 .load(title)('font')
 .text() !== ''
 ) {
 title = cheerio
 .load(title)('font')
 .text();
 } else {
 title = title.text();
 }

 const single = {
 title: title,
 link: link,
 guid: path,
 };
 const promise = axios_ins.get(url.resolve(base, path));
 reqList.push(promise);
 indexList.push(i - skip);
 out.push(single);
 }
 let resList;
 try {
 resList = await axios.all(reqList);
 } catch (error) {
 ctx.state.data = `Error occurred: ${error}`;
 return;
 }
 for (let i = 0; i &lt; resList.length; i++) {
 let item = resList[i];
 item = iconv.decode(item.data, 'gbk');
 let $ = cheerio.load(item);
 let time = $('#main &gt; div:nth-child(4) &gt; table &gt; tbody &gt; tr:nth-child(2) &gt; th &gt; div').text();
 const regex = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
 const regRes = regex.exec(time);
 time = regRes === null ? new Date() : new Date(regRes[0]);
 time.setTime(time.getTime() + (sourceTimezoneOffset - time.getTimezoneOffset() / 60) * 60 * 60 * 1000);

 const content = $('#main &gt; div:nth-child(4) &gt; table &gt; tbody &gt; tr.tr1.do_not_catch &gt; th:nth-child(2) &gt; table &gt; tbody &gt; tr &gt; td &gt; div.tpc_content.do_not_catch').html();

 // Change the image tag to display image in rss reader
 try {
 $ = cheerio.load(content);
 } catch (error) {
 console.log(error);
 continue;
 }

 // Handle video
 const video = $('a:nth-of-type(2)');
 if (video) {
 const videoScript = video.attr('onclick');
 const regVideo = /https?:\/\/.*'/;
 const videoRes = regVideo.exec(videoScript);
 if (videoRes &amp;&amp; videoRes.length !== 0) {
 let link = videoRes[0];
 link = link.slice(0, link.length - 1);
 $('iframe').attr('src', link);
 }
 }

 // Handle img tag
 let images = $('img');
 for (let k = 0; k &lt; images.length; k++) {
 $(images[k]).replaceWith(`&lt;img src="${$(images[k]).attr('data-src')}"&gt;`);
 }
 // Handle input tag
 images = $('input');
 for (let k = 0; k &lt; images.length; k++) {
 $(images[k]).replaceWith(`&lt;img src="${$(images[k]).attr('data-src')}"&gt;`);
 }

 // Handle links
 const links = $('a[href*=\'viidii\']');
 for (let k = 0; k &lt; links.length; k++) {
 $(links[k]).attr('href', killViidii($(links[k]).attr('href')));
 }

 out[indexList[i]].description = $.html();
 out[indexList[i]].pubDate = time.toUTCString();
 ctx.cache.set(out[indexList[i]].link, JSON.stringify(out[indexList[i]]), 3 * 60 * 60);
 }

 ctx.state.data = {
 title: $('title').text(),
 link: url.resolve(base, `${section}${ctx.params.id}`),
 item: out,
 };
};