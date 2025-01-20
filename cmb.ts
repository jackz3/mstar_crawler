import { stringify } from 'csv-stringify/sync'
import { writeFile } from 'fs/promises'
import axios from 'axios'
import * as cheerio from 'cheerio'

const PageSize = 100
const data: any[][] = []
const columns = [ 'code', 'name', 'subType', 'risk', 'shortName', 'orgCode', 'orgName', 'BUYNFQ', 'subscribeRate', 'buyRate', 'manageRate', 'redeemRate']

async function wait(time:number) {
  return new Promise(resolve => setTimeout(resolve, time)) 
}
async function queryGames(pageIdx: number = 1) {
  const postData = {"type":"PD","isOwn":"A","isPublic":"Z","status":"1","keywords":"","pageNo":pageIdx,"pageSize":PageSize,"crossFinance":"Z","riskLevel":""}
  const params = new URLSearchParams({"queryParam": JSON.stringify(postData)})
  return axios.post('http://link.cmbchina.com/cmbfinprod/SevAjax/ProdHandler.ashx', params).then(res => {
    return res.data
  })
  .catch(err => console.log(err))
}

function extractGame(result: {
  name: string,
  BUYNFQ: number, // 起购金额
  buyRate: number, // 申购费率
  code: string,
  manageRate: number, // 管理费率
  orgCode: string,
  orgName: string,
  redeemRate: number, // 赎回费率
  risk: string,
  shortName: string,
  subType: string,
  subscribeRate: number //认购费率
}[]) {
  console.log(result[0].name)
  result.forEach(g => {
    const item = [ g.code, g.name, g.subType, g.risk, g.shortName, g.orgCode, g.orgName, g.BUYNFQ, g.subscribeRate, g.buyRate, g.manageRate, g.redeemRate]
    data.push(item)
  })

}
async function fetchPlatGames() {
  try {
    const res = await queryGames()
    const { prodList, total } = res
    console.log({ total })
    const count = Math.ceil(total / PageSize)
    extractGame(prodList)
    for(let i = 2; i <= count; i++) {
      const pagingGames = await queryGames(i)
      const { prodList } = pagingGames
      extractGame(prodList)
      await wait(200)
    }
    const fileName = `./output/cmb_funds.csv`
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