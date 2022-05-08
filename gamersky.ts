import { stringify } from 'csv-stringify/sync'
import { writeFile } from 'fs/promises'
import axios from 'axios'
import * as cheerio from 'cheerio'

const [a, b, plt = 'psv'] = process.argv
// console.log(a, b, plt);
const Platforms: {[key: string]: string} = {
  psv: 'https://ku.gamersky.com/sp/1756-0-0-0-0-0.html',
  ps4: 'https://ku.gamersky.com/sp/1758-0-0-0-0-0.html'
}
const PageSize = 36
const columns = ['gs_id', 'title', 'title_en', 'release_date', 'maker', 'issuer', 'rating', 'genre', 'tags', 'hasZh', 'platforms']
const data: any[][] = []

async function wait(time:number) {
  return new Promise(resolve => setTimeout(resolve, time)) 
}
async function queryGames(platform: string, pageIdx: number = 1) {
  const jsondata = {"rootNodeId":"20039","pageIndex":pageIdx,"pageSize":"36","sort":"10"}
  return axios.get('https://ku.gamersky.com/SearchGameLibAjax.aspx', {
    headers: {
      "Referer": Platforms[platform],
    },
    params:  { jsondata }
  }).then(res => {
    return JSON.parse(res.data.slice(1, -2))
  })
  // .catch(err => console.log(err))
}

function extractField(html: string) {
  const $ = cheerio.load(html)
  const contents: string[] = []
  $('a').each((i, elem) => {
    contents.push($(elem).text().trim())
  })
  return contents.join(' ')
}
function extractGame(result: {
  allTimeT: string,
  enTitle: string,
  gameMake: string,
  gameProperties: string,
  id: string,
  issue: string,
  officialChinese: string,
  pingTai: string,
  ratingAverage: number,
  tag: string,
  title: string
}[]) {
  console.log(result[0].title)
  result.forEach(g => {
    let date = new Date(g.allTimeT)
    const item = [g.id, g.title, g.enTitle, isNaN(date.valueOf()) ? '' : date.toLocaleDateString(), g.gameMake, g.issue, g.ratingAverage, extractField(g.gameProperties), extractField(g.tag), g.officialChinese, extractField(g.pingTai)]
    data.push(item)
  })

}
async function fetchPlatGames(platform: string) {
  try {
    const res = await queryGames(platform)
    const { result, total } = res
    const count = Math.floor(total / PageSize)
    extractGame(result)
    for(let i = 2; i < count; i++) {
      const pagingGames = await queryGames(platform, i)
      const { result } = pagingGames
      extractGame(result)
      await wait((i > 50 ? 50 : i) * 400)
    }
    const fileName = `./output/gs_${platform}.csv`
    const output = await stringify(data, {
      bom: true, header: true, columns
    })
    writeFile(fileName, output)
    console.log('done!')
  } catch (err) {
    console.log(err)
  }
}

(async function () {
  fetchPlatGames(plt) 
})()