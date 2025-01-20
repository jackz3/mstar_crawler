import { chromium, Page } from 'playwright'
import { existsSync } from 'fs'
import { writeFile, readFile, appendFile, unlink } from 'fs/promises'
import { stringify } from 'csv-stringify/sync'
import { parse } from 'csv-parse/sync'

const [a, b, pageType, fromPage = ''] = process.argv
console.log(pageType , fromPage)
const fromTypes= pageType.split(',')
const fromPages = fromPage.split(',')
const froms = fromTypes.map((x, i) => fromPages[i] ?? '1')
const Headless = true
const Devtools = true
const SkipUrls: {[url: string]: [string, string]} = {
  '/handler/authentication.ashx': ['text/html', 'Success|Man'],
  '/handler/home.ashx': ['text/html', '[]']
}

type FundData = string[]

;(async () => {
  const browser = await chromium.launch({ headless: Headless, devtools: Devtools})
  const context = await browser.newContext({ storageState: 'state.json' })
  await Promise.all(fromTypes.map(async (x, i) => {
    const page = await context.newPage()
    return pageCrawl(page, x, froms[i])
  })) 
  await browser.close();
})()

async function pageCrawl (page: Page, crawlType: string, from: string) {
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
  page.setDefaultNavigationTimeout(60 * 1000)
  await page.goto('https://www.morningstar.cn/quickrank/default.aspx')
  await page.click('input#ctl00_cphMain_btnGo')
  await page.waitForTimeout(5000)
  const rankCols = ['code', 'name', 'fundType', 'rank3y', 'rank5y', 'nvDate', 'net', 'diff', 'retYear']
  const rankPage1 = await extractPage(page, rankCols, 2)
  const nvDate = rankPage1[0][5]
  console.log({nvDate})
  const funds : FundData[] = []
  const fileName = `./output/${crawlType}_${nvDate}.csv`
  let fromPageNum: number = 1
  if (from !== '1') {
    try {
      const jsonTxt = await readFile(`./output/${crawlType}_${nvDate}.csv`)
      if (jsonTxt) {
        const records = parse(jsonTxt, { columns: false })
        const rows = records.length - 1
        console.log('records count:', rows)
        if (from === '?') {
          fromPageNum = rows / 25 + 1    
        } else {
          fromPageNum = parseInt(from)
        }
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
    await crawlAllPages(funds, page, rankCols, fromPageNum, nvDate, crawlType);
  } else {
    await Crawl(funds, page, nvDate, crawlType, fromPageNum)
  }
}

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
      let errCount = 0
      while (errCount < 3) {
        try {
          await Promise.all([
            page.evaluate(([curPage]) => (<any>window)['__doPostBack']('ctl00$cphMain$AspNetPager1', curPage), [curPage.toString()]),
            page.waitForNavigation()
          ])
        } catch (err) {
          errCount++
          console.error(err)
          continue
        }
          break
      }
      if (errCount >= 3) {
        throw Error(`error when crawling page ${curPage}`)
      }
      // process.stdout.write(`${crawlType} page ${curPage},`)
      console.log(`${crawlType} fetched page ${curPage}`)
      await savePage(funds, page, cols, curPage === maxPage)
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
  console.log(`${crawlType} saved csv file +${funds.length}`);
  funds.splice(0, funds.length)
}

async function savePage (funds: FundData[], page: Page, cols: string[], isLastPage: boolean = false) {
  const pageFunds = await extractPage(page, cols, 2)
  if (pageFunds.length !== 25 && !isLastPage) {
    throw new Error('page error')
  }
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
          if (item !== '-' && ['rank3y', 'rank5y', 'style'].includes(cols[idx - offset])) {
            item = await tds.nth(idx).locator('img').getAttribute('src') ?? ''
          }
          pd.push(item)
        }
        pageData.push(pd)
    }
    return pageData
}
