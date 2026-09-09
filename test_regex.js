const body = '[-ZAAD SHILLING-] Tix: 15652525521, Waxaad SLSH1,500 ka heshay MAXAMED SAYID MAXAMED NUUX (634284015) Tar: 31/08/26 23:01:33, Hadhaagaaga:SLSH7,149.4.Warbixinta dhaqdhaqaaqyada ka hel Waafi http://onelink.to/waafi';
const amountPattern = /(?:SLSH\s*|SLS\s*)(\d{1,3}(?:,\d{3})*(?:\.\d+)?)|(?:(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*SLS)/i;
const senderPattern = /(?:\((\d{7,10})\)|from\s+(\d{7,10}))/i;
const txIdPattern = /Tix[:\s]*([A-Za-z0-9]+)|Ref(?:[:\s]+)?([A-Za-z0-9]+)/i;

console.log('Amount:', amountPattern.exec(body));
console.log('Sender:', senderPattern.exec(body));
console.log('TxId:', txIdPattern.exec(body));
