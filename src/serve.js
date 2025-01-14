import Router from '@koa/router';
import Koa from 'koa';
import bodyparser from 'koa-bodyparser';
import multiparty from 'multiparty';
import { userLogin, getAccountInfo, getCourses, getPanToken } from './functions/user.js';
import { getSignActivity, preSign } from "./functions/activity.js";
import { QRCodeSign } from './functions/QRCode.js';
import { LocationSign } from './functions/location.js';
import { GeneralSign } from './functions/general.js';
import { PhotoSign, uploadPhoto } from './functions/photo.js';
import { QrCodeScan } from './functions/tencent/QrCodeOCR.js';
import ENVJSON from './env.json' assert {type: 'json'};
import serverless from 'serverless-http';

const app = new Koa()
const router = new Router()

router.get('/', async (ctx) => {
  ctx.body = `<h1 style="text-align: center">Welcome, chaoxing-sign-cli API service is running.</h1>`
})

router.post('/login', async (ctx) => {
  let params = await userLogin(ctx.request.body.phone, ctx.request.body.password)
  // 登陆失败
  if (params === 'AuthFailed') {
    ctx.body = 'AuthFailed'
    return
  }
  params.name = await getAccountInfo(params.uf, params._d, params._uid, params.vc3)
  console.log(ctx.request.body)

  ctx.body = params
})

router.post('/activity', async (ctx) => {
  let courses = await getCourses(ctx.request.body.uid, ctx.request.body._d, ctx.request.body.vc3)
  // 身份凭证过期
  if (courses === 'AuthRequired') {
    ctx.body = 'AuthRequired'
    return
  }
  let activity = await getSignActivity(courses, ctx.request.body.uf, ctx.request.body._d, ctx.request.body.uid, ctx.request.body.vc3)
  // 无活动
  if (activity === 'NoActivity') {
    ctx.body = 'NoActivity'
    return
  }
  // 对活动进行预签
  await preSign(ctx.request.body.uf, ctx.request.body._d, ctx.request.body.vc3, activity.aid, activity.classId, activity.courseId, ctx.request.body.uid)
  console.log(ctx.request.body.uid)
  ctx.body = activity
})

router.post('/qrcode', async (ctx) => {
  let res = await QRCodeSign(ctx.request.body.enc, ctx.request.body.name, ctx.request.body.fid, ctx.request.body.uid, ctx.request.body.aid, ctx.request.body.uf, ctx.request.body._d, ctx.request.body.vc3)
  console.log(ctx.request.body.name, ctx.request.body.uid)
  if (res === 'success') {
    ctx.body = 'success'
    return
  } else {
    ctx.body = res
  }
})

router.post('/location', async (ctx) => {
  let res = await LocationSign(ctx.request.body.uf, ctx.request.body._d, ctx.request.body.vc3, ctx.request.body.name, ctx.request.body.address, ctx.request.body.aid, ctx.request.body.uid, ctx.request.body.lat, ctx.request.body.lon, ctx.request.body.fid)
  console.log(ctx.request.body.name, ctx.request.body.uid)
  if (res === 'success') {
    ctx.body = 'success'
    return
  } else {
    ctx.body = res
  }
})

router.post('/general', async (ctx) => {
  let res = await GeneralSign(ctx.request.body.uf, ctx.request.body._d, ctx.request.body.vc3, ctx.request.body.name, ctx.request.body.aid, ctx.request.body.uid, ctx.request.body.fid)
  console.log(ctx.request.body.name, ctx.request.body.uid)
  if (res === 'success') {
    ctx.body = 'success'
    return
  } else {
    ctx.body = res
  }
})

router.post('/uvtoken', async (ctx) => {
  let res = await getPanToken(ctx.request.body.uf, ctx.request.body._d, ctx.request.body.uid, ctx.request.body.vc3)
  ctx.body = res
})

router.post('/upload', async (ctx) => {
  let form = new multiparty.Form()
  let fields = {}
  let data = []

  let result = await new Promise((resolve) => {
    // 解析到part时，判断是否为文件
    form.on('part', (part) => {
      if (part.filename !== undefined) {
        // 存入data数组
        part.on('data', (chunk) => {
          data.push(chunk)
        })
        // 存完继续
        part.on('close', () => {
          part.resume()
        })
      }
    })
    // 解析遇到文本时
    form.on('field', (name, str) => {
      fields[name] = str
    })
    // 解析完成后
    form.on('close', async () => {
      let buffer = Buffer.concat(data)
      let res = await uploadPhoto(fields['uf'], fields['_d'], fields['_uid'], fields['vc3'], ctx.query._token, buffer)
      resolve(res)
      console.log(res)
    })
    // 解析请求表单
    form.parse(ctx.req)
  })
  ctx.body = result
})

router.post('/photo', async (ctx) => {
  let res = await PhotoSign(ctx.request.body.uf, ctx.request.body._d, ctx.request.body.vc3, ctx.request.body.name, ctx.request.body.aid, ctx.request.body.uid, ctx.request.body.fid, ctx.request.body.objectId)
  console.log(ctx.request.body.name, ctx.request.body.uid)
  if (res === 'success') {
    ctx.body = 'success'
    return
  } else {
    ctx.body = res
  }
})

router.post('/qrocr', async (ctx) => {
  let form = new multiparty.Form()
  let data = []
  let result = await new Promise((resolve) => {
    form.on('part', (part) => {
      if (part.filename !== undefined) {
        part.on('data', (chunk) => {
          data.push(chunk)
        })
        part.on('close', () => {
          part.resume()
        })
      }
    })
    form.on('close', async () => {
      let buffer = Buffer.concat(data)
      let base64str = buffer.toString('base64')
      let res
      try {
        res = await QrCodeScan(base64str)
        resolve(res.CodeResults[0].Url.split('=').pop())
        console.log(res)
      } catch (error) {
        resolve('识别失败')
      }
    })
    form.parse(ctx.req)
  })
  ctx.body = result
})

app.use(bodyparser())
app.use(async (ctx, next) => {
  ctx.set("Access-Control-Allow-Origin", "*")
  ctx.set("Access-Control-Allow-Headers", "Content-Type")
  await next()
})
app.use(async (ctx, next) => {
  if (ctx.method === 'OPTIONS') {
    ctx.body = ''
  }
  await next()
});
app.use(router.routes())

// 若在服务器，直接运行
if (!ENVJSON.env.SERVERLESS) app.listen(5000, () => { console.log("API Server: http://localhost:5000") })

// 导出云函数
export const main = serverless(app)
export const handler = main
export const main_handler = main