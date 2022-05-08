import { request, gql } from 'graphql-request'
import { stringify } from 'csv-stringify/sync'
import { writeFile } from 'fs/promises'

const [a, b, plt = 'psv'] = process.argv
// console.log(a, b, plt);
const platforms: {[key: string]: string} = {
    'psv': '46',
    'ps4': '48'
}
const PageSize = 100
const endpoint = 'https://graphql-xy.tgbus.com/graphql'
const variables = {
  "platform": "46",
  // "themes": "",
  // "companies_developers": "",
  // "genres": "",
  "interface_lang": "",
  "first": PageSize,
  "skip": 0
}

const query = gql`
query Games(
  $platform: String!
  $interface_lang: String
  $first: Int = 10
  $skip: Int = 0
) {
  games(
    filters: {
      platform: $platform
      interface_lang: $interface_lang
    }
    first: $first
    skip: $skip
    orderBy: { field: "weight", direction: DESC }
  ) {
    id
    name
    names {
      content
      lang
    }
    covers {
      path
    }
    weight
    interface_lang
  }
  paging_games_count(
    filters: {
      platform: $platform
      interface_lang: $interface_lang
    }
  ) {
    games_total
  }
}
`
type Names = {content: string, lang: string}[]
const columns = ['a9_id', 'name_cn', 'name_tw', 'name_en', 'name_jp']
const data: any[][] = []

function getName(names: Names, langs: string[]) {
  for(let i = 0; i < langs.length; i++) {
    const name = names.find(x => x.lang === langs[i])
    if (name) {
      return name.content
    }
  }
  return ''
}
async function getPagingGames(platform: string, skip: number = 0) {
  variables.platform = platform
  variables.skip = skip
  return request({
    url: endpoint,
    document: query,
    variables: variables
  })
}

async function crawlPlatform(platform:string) {
  const platformCode = platforms[platform]
  const res = await getPagingGames(platformCode)
  const { games, paging_games_count = {} } = res
  const { games_total = 0 } = paging_games_count
  const pages = Math.ceil(games_total / PageSize)
  appendGames(games)
  for(let i = 1; i < pages; i++) {
    const pagingGames = await getPagingGames(platformCode, i * PageSize)
    const { games } = pagingGames
    if (!games.length) {
      break;
    }
    appendGames(games)
  }

  const fileName = `./output/a9_${platform}.csv`
  const output = await stringify(data, {
    bom: true, header: true, columns
  })
  writeFile(fileName, output)
  console.log(`${platform} saved`);
}

(async function() {
  await crawlPlatform(plt)
})()

const knowLangs = ['汉语（简体）', '汉语', '汉语（繁体-香港）', '汉语（繁体-台湾）', '英语', '英语（美国）', '日语', '']
function appendGames(games: any) {
  console.log(games[0].name)
  games.forEach((game: { id: number; names: Names} ) => {
    game.names.forEach(g => {
      if(!knowLangs.includes(g.lang)) {
        // if (g.lang.length)
          console.log(`unknow lang:${g.lang}, id: ${game.id}`)
      }
    })
    const nameCn = getName(game.names, ['汉语（简体）', '汉语', ''])
    const nameTw = getName(game.names, ['汉语（繁体-香港）', '汉语（繁体-台湾）'])
    const nameEn = getName(game.names, ['英语', '英语（美国）'])
    const nameJp = getName(game.names, ['日语'])
    const item = [game.id, nameCn, nameTw, nameEn, nameJp]
    data.push(item)
  })
}
