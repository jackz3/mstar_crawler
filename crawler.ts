import { chromium, Page } from 'playwright'
import { existsSync } from 'fs'
import { writeFile, readFile, appendFile, unlink } from 'fs/promises'
import { stringify } from 'csv-stringify/sync'
import { parse } from 'csv-parse/sync'

const [a, b, crawlType, fromPage] = process.argv
const fromPageNum = parseInt(fromPage) || 1
console.log(crawlType , fromPageNum)
const Headless = true
const Devtools = true
const SkipUrls: {[url: string]: [string, string]} = {
  '/handler/authentication.ashx': ['text/html', 'Success|Man'],
  '/handler/home.ashx': ['text/html', '[]']
}

type FundData = string[]

;(async () => {
  const browser = await chromium.launch({ headless: true, devtools: Devtools})
  const context = await browser.newContext({ storageState: 'state.json' })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const req = route.request()
    const resType = route.request().resourceType()
    if (resType === 'xhr') {
      const { pathname } = new URL(req.url())
      const skipUrl = SkipUrls[pathname]
      if (skipUrl) {
        return route.fulfill({
          contentType: skipUrl[0],
          body: skipUrl[1]
        })
      } else {
        console.log({pathname})
      }
    }
    if (resType === 'image') {
        return route.abort()
    }
    return route.continue()
  })
  await page.goto('https://www.morningstar.cn/quickrank/default.aspx')
  const rankCols = ['code', 'name', 'fundType', 'rank3y', 'rand5y', 'nvDate', 'net', 'diff', 'retYear']
  const rankPage1 = await extractPage(page, rankCols, 2)
  const nvDate = rankPage1[0][5]
  console.log({nvDate})
  const funds : FundData[] = []
  const fileName = `./output/${crawlType}_${nvDate}.csv`
  if (fromPageNum > 1) {
    try {
      const jsonTxt = await readFile(`./output/${crawlType}_${nvDate}.csv`)
      if (jsonTxt) {
        const records = parse(jsonTxt, { columns: false })
        console.log('records count:', records.length)
        // for(let i = 1; i < records.length; i++) {
        //   funds.push(records[i])
        // }
      }
    } catch (err) {
      // console.error(err)
      console.log('no saved file')
    }
  } else {
    if (existsSync(fileName)) {
      await unlink(fileName)
    }
  }
  if (crawlType === 'snapshot') {
    // let pageNum = fromPageNum
    // if (fromPageNum === 1) {
    //   await savePage(funds, page, rankCols)
    //   pageNum = 2
    // }
    await crawlAllPages(funds, page, rankCols, fromPageNum, nvDate, crawlType);
  } else {
    await Crawl(funds, page, nvDate, crawlType, fromPageNum)
  }
  await browser.close();
})()

async function Crawl(funds: FundData[], page: Page, nvDate: string, crawlType: string, pageNum: number) {
  let cols: string[]
  switch (crawlType) {
    case 'performance':
      cols = ['code', 'name', 'ret1d', 'ret1w', 'ret1m', 'ret3m', 'ret6m', 'ret1y', 'ret2y', 'ret3y', 'ret5y', 'ret10y', 'retTotal', 'std3y', 'risk3y']
      break
    case 'portfolio':
      cols = ['code', 'name', 'style', 'stockProp', 'bondProp', 'stock10Prop', 'bond5Prop', 'netAsset']
      break
    case 'operations':
      cols = ['code', 'name', 'foundOn', 'canBuy', 'canSell', 'minInvestment', 'frontendFee', 'backendFee', 'redeem', 'manageFee', 'hostingFee', 'salesFee']
      break
    default:
      console.log('unknown ' + crawlType)
      return
  }
  const href = `a#ctl00_cphMain_lb${crawlType[0].toUpperCase() + crawlType.slice(1)}`
  await Promise.all([
    page.click(href),
    page.waitForNavigation()
  ])
  await crawlAllPages(funds, page, cols, pageNum, nvDate, crawlType)
}

async function crawlAllPages(funds: FundData[], page: Page, cols: string[], pageNum: number, nvDate: string, crawlType: string) {
  if (pageNum === 1) {
    await savePage(funds, page, cols)
    pageNum = 2 
  }
  const lastPage = await page.locator('div#ctl00_cphMain_AspNetPager1 a >> text=">>"')
  const lastHref = await lastPage.getAttribute('href')
  const reg = /javascript:.*'(\d+)'\)$/
  const match = lastHref?.match(reg)
  if (match?.length === 2) {
    const maxPage = +match[1]
    console.log('max', maxPage)
    for (let curPage = pageNum; curPage <= maxPage; curPage++) {
      await Promise.all([
        page.evaluate(([curPage]) => (<any>window)['__doPostBack']('ctl00$cphMain$AspNetPager1', curPage), [curPage.toString()]),
        page.waitForNavigation()
      ])
      process.stdout.write(`page ${curPage},`)
      await savePage(funds, page, cols)
      if (curPage % 10 === 0) {
        if (curPage === 10) {
          
        }
        saveCsv(funds, cols, nvDate, crawlType)
      }
    }
  }
  await page.waitForTimeout(6000)
  saveCsv(funds, cols, nvDate, crawlType)
  console.log('done!!! items', funds.length)

  await page.screenshot({ path: `morningstar.png`, fullPage: true })
}

async function saveCsv(funds: FundData[], cols: string[], nvDate: string, crawlType: string) {
  const fileName = `./output/${crawlType}_${nvDate}.csv`
  const header = !existsSync(fileName)
  const output = await stringify(funds, {
    bom: true, header, columns: cols
  })
  appendFile(fileName, output)
  console.log('save csv', funds.length);
  funds.splice(0, funds.length)
}

async function savePage (funds: FundData[], page: Page, cols: string[]) {
  const pageFunds = await extractPage(page, cols, 2)
  console.log('save page', pageFunds.length);
  pageFunds.forEach(data => {
    funds.push(data)
  })
}


async function extractPage (page: Page, cols: string[], offset: number) {
    const trs = await page.locator('table#ctl00_cphMain_gridResult tr');
    const rows = await trs.count()
    const pageData: FundData[] = []
    
    for (let i = 1; i < rows; i++) {
        const pd: FundData = []
        const tds = await trs.nth(i).locator('td')
        const maxColId = cols.length + offset
        for (let idx = offset; idx < maxColId; idx++) {
          let item = await tds.nth(idx).textContent() ?? ''
          if (item !== '-' && ['rank3y', 'rand5y', 'style'].includes(cols[idx - offset])) {
            item = await tds.nth(idx).locator('img').getAttribute('src') ?? ''
          }
          pd.push(item)
        }
        pageData.push(pd)
    }
    return pageData
}
