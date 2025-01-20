import { chromium } from 'playwright'

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://www.morningstar.cn/membership/signin.aspx')
  await page.waitForLoadState('load')
  await page.fill('input#emailTxt', '@163.com')
  await page.fill('input#pwdValue', 'pass')
  // await page.focus('input#txtCheckCode')
  await page.waitForTimeout(5000)
  await page.click('input#loginGo')
  await page.waitForTimeout(4000)
  await page.context().storageState({ path: 'state.json' })
  await browser.close()
})();