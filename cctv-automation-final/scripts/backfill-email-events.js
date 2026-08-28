require("dotenv").config({ quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { classify } = require("../engine");
const { persistClassifiedEmails } = require("../eventStore");

const days = Math.max(1, Math.min(366, Number(process.argv.find(value => /^\d+$/.test(value))) || 45));
const folder = process.env.IMAP_FOLDER || "INBOX";
const since = new Date(Date.now() - days * 86400000);
const storeMapPath = path.resolve(__dirname, "..", "config", "store-map.json");
const storeMap = fs.existsSync(storeMapPath) ? JSON.parse(fs.readFileSync(storeMapPath, "utf8")) : {};
const client = new ImapFlow({host:process.env.IMAP_HOST,port:Number(process.env.IMAP_PORT),secure:true,auth:{user:process.env.IMAP_USER,pass:process.env.IMAP_PASSWORD},logger:false});

async function main(){
  const totals={days,folder,mode:"READ_ONLY",matched:0,inserted:0,existing:0,linked:0,unlinked:0,discarded:0,unknown:0};
  await client.connect();
  try{
    const lock=await client.getMailboxLock(folder,{readOnly:true});
    try{
      const uids=await client.search({since},{uid:true});
      totals.matched=uids.length;
      for(let offset=0;offset<uids.length;offset+=200){
        const batchUids=uids.slice(offset,offset+200),classified=[];
        for await(const msg of client.fetch(batchUids,{envelope:true,source:true,uid:true},{uid:true})){
          const parsed=await simpleParser(msg.source);
          classified.push(classify({uid:msg.uid,subject:msg.envelope?.subject||"",from:msg.envelope?.from?.[0]?.address||"",date:msg.envelope?.date||null,hasAttachment:(parsed.attachments||[]).length>0,body:parsed.text||""},storeMap));
        }
        const result=persistClassifiedEmails(classified,{folder});
        for(const key of ["inserted","existing","linked","unlinked","discarded","unknown"])totals[key]+=result[key];
      }
    }finally{lock.release();}
  }finally{if(client.usable)await client.logout();else client.close();}
  console.log(JSON.stringify(totals,null,2));
}
main().catch(error=>{console.error(error);process.exit(1);});
