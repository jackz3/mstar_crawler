import { stringify } from 'csv-stringify/sync'
import { writeFile } from 'fs/promises'
import axios from 'axios'

const PageSize = 150
const data: any[][] = []
const columns = [ 'FundCode', 'ShortName', 'InvestmentType', 'CompanyCode', 'CompanyName', 'CurrentSaleState', 'CurrentState', 'PurchaseDiscount', 'PurchaseRate' ]

async function wait(time:number) {
  return new Promise(resolve => setTimeout(resolve, time)) 
}

async function queryGames(pageIdx: number = 1) {
  return axios.get('https://ewealth.abchina.com/app/data/api/DataService/FundFilterV2_New', {
    params: {
      i: pageIdx,
      s: PageSize,
      w: '0%7C-1%7C-1%7C1%7C0%7C1%7C1%7C0%7C-1%7C9_DESC',
      o: 2
  },
  }).then(res => {
    return res.data
  })
  .catch(err => console.log(err))
}

function extractGame(result: {
  // AIPDiscount: string, 
  // AccumulatedNetValue: string,
  // CanFixedInvestment: "1"
  CompanyCode: string,
  CompanyName: string,
  CurrentSaleState: string, //0 不能买 2 买
  CurrentState: string,
  // DayChanged: "0.3696"
  // DayGrowthRate: "0.3696"
  // DeclareDate: "2022-07-05T00:00:00+08:00"
  FundCode: string,
  Id: string,
  InvestmentType: string,
  // IsSpecial: "0"
  // LastMonth: "0.2176"
  // LastOneYear: "0.3745"
  // LastQuarter: "0.2750"
  // LastTwoYears: "1.2961"
  // MillionRate: "0.0000"
  // NetValue: "4.6160"
  PurchaseDiscount: string,
  PurchaseRate: string,
  // PurchaseUrl: ""
  // ScaleType: "1"
  ShortName: string,
  // SinceEstablished: "3.5990"
  // sequence: "2"
}[]) {
  console.log(result[0].ShortName)
  result.forEach(g => {
    const item = [ g.FundCode, g.ShortName, g.InvestmentType, g.CompanyCode, g.CompanyName, g.CurrentSaleState, g.CurrentState, g.PurchaseDiscount, g.PurchaseRate]
    data.push(item)
  })
}
async function fetchPlatGames() {
  try {
    const res = await queryGames()
    const { Data, ErrorCode } = res
    console.log(ErrorCode)
    const total = Data.Table1[0].RowCount
    console.log(total)
    const count = Math.ceil(total / PageSize)
    extractGame(Data.Table)
    for(let i = 2; i <= count; i++) {
      const pagingGames = await queryGames(i)
      const { Data } = pagingGames
      extractGame(Data.Table)
      await wait(100)
    }
    const fileName = `./output/nyyh_funds.csv`
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