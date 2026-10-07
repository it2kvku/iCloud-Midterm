import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
class SharedTestStore extends session.Store {
 rows=new Map();
 get(id,cb){cb(null,this.rows.has(id)?JSON.parse(this.rows.get(id)):null);}
 set(id,data,cb){this.rows.set(id,JSON.stringify(data));cb?.();}
 destroy(id,cb){this.rows.delete(id);cb?.();}
 touch(id,data,cb){this.set(id,data,cb);}
}
const accounts=await Promise.all(['reader','writer'].map(async role=>({username:role,role,passwordHash:await hashPassword('test-'+role)})));
const config={studentName:'Tran Van Lam',studentId:'23IT139',prefix:'139',vat:15,sessionSecret:'s'.repeat(48),production:false,accounts};
const token=p=>p.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
const cookie=p=>p.headers['set-cookie'][0].split(';')[0];
function fixture(){const saved=[];let reads=0;const options={config,store:new SharedTestStore(),books:{list:async()=>{reads++;return saved;},add:async b=>saved.push(b)}};return {options,app:createApp(options),saved,reads:()=>reads};}
async function login(app,role){const page=await request(app).get('/login').expect(200);const result=await request(app).post('/login').set('Cookie',cookie(page)).type('form').send({_csrf:token(page),username:role,password:'test-'+role}).expect(303);assert.notEqual(cookie(page),cookie(result));const home=await request(app).get('/').set('Cookie',cookie(result)).expect(200);return {cookie:cookie(result),csrf:token(home),home};}
test('guest and invalid credentials are rejected',async()=>{const {app}=fixture();await request(app).get('/').expect(302);await request(app).post('/books').send({}).expect(401);await request(app).post('/login').type('form').send({}).expect(403);const p=await request(app).get('/login');await request(app).post('/login').set('Cookie',cookie(p)).type('form').send({_csrf:token(p),username:'reader',password:'wrong'}).expect(401);});
test('reader sees escaped books but cannot write',async()=>{const {app,saved}=fixture();saved.push({code:'139-1',title:'<script>bad()</script>',author:'Lam',price:100000,total:115000,vat:15});const u=await login(app,'reader');assert.match(u.home.text,/&lt;script&gt;/);assert.doesNotMatch(u.home.text,/action="\/books"/);await request(app).post('/books').set('Cookie',u.cookie).type('form').send({_csrf:u.csrf,role:'writer'}).expect(403);assert.equal(saved.length,1);});
test('writer uses shared session across instances and cannot read books',async()=>{const {app,options,saved,reads}=fixture();const u=await login(app,'writer');const second=createApp(options);await request(second).post('/books').set('Cookie',u.cookie).type('form').send({_csrf:u.csrf,code:'139-1',title:'Cloud',author:'Lam',price:'100000',total:'1'}).expect(303);assert.equal(saved[0].total,115000);assert.equal(reads(),0);await request(second).post('/books').set('Cookie',u.cookie).type('form').send({_csrf:u.csrf,code:'138-1',title:'Cloud',author:'Lam',price:'10'}).expect(400);await request(second).post('/books').set('Cookie',u.cookie).type('form').send({_csrf:'wrong'}).expect(403);await request(second).post('/logout').set('Cookie',u.cookie).type('form').send({_csrf:u.csrf}).expect(303);await request(app).get('/').set('Cookie',u.cookie).expect(302);});
test('password rotation revokes session; secure production cookies',async()=>{const {app,options}=fixture();const u=await login(app,'reader');const altered={...config,accounts:accounts.map(a=>({...a,passwordHash:a.passwordHash+'0'}))};await request(createApp({...options,config:altered})).get('/').set('Cookie',u.cookie).expect(302);const p=await request(createApp({...options,config:{...config,production:true}})).get('/login').set('X-Forwarded-Proto','https').expect(200);assert.match(p.headers['set-cookie'][0],/Secure/);await request(app).get('/healthz').expect(200);});
