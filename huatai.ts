import { stringify } from 'csv-stringify/sync'
import { writeFile } from 'fs/promises'
import axios from 'axios'
import * as cheerio from 'cheerio'

const PageSize = 60 
const data: any[][] = []
const columns = ['name', 'type', 'manager']

async function wait(time:number) {
  return new Promise(resolve => setTimeout(resolve, time)) 
}
async function queryGames(pageIdx: number = 1) {
  const postData: Record<string, string> = { "page":pageIdx.toString(),"pageSize": PageSize.toString() }
  const params = new URLSearchParams(postData)
  return axios.post('https://www.htsc.com.cn/htsc/api/dxjr/queryDxjr.do', params
  ).then(res => {
    return res.data.result
  })
  .catch(err => console.log(err))
}

function extractGame(result: {
  manager: string,
  name: string,
  type: string,
}[]) {
  console.log(result[0].name)
  result.forEach(g => {
    const item = [ g.name, g.type, g.manager ]
    data.push(item)
  })

}
async function fetchPlatGames() {
  try {
    const res = await queryGames()
    const { arr, totalPages } = res
    console.log({ totalPages })
    const count = totalPages
    extractGame(arr)
    for(let i = 2; i <= count; i++) {
      const pagingGames = await queryGames(i)
      const { arr } = pagingGames
      extractGame(arr)
      await wait(300)
    }
    const fileName = `./output/huatai_funds.csv`
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
  fetchPlatGames() 
})()