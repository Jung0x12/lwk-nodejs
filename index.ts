import * as lwk from "lwk_node"
import * as fs from 'fs';
import * as readline from 'readline';

// 創建一個用於讀取用戶輸入的介面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 全局變量
let network: lwk.Network;
let signer: lwk.Signer | null = null;
let wollet: lwk.Wollet | null = null;
let esplora: lwk.EsploraClient | null = null;
const walletDataDir = './wallet_data';
const mnemonicFilePath = `${walletDataDir}/mnemonic.txt`;
const defaultAssetId = "0f82e3be4e0644251bccfc1281249d5fa77bc67bb3d32af2025b4a3c3a0eb9c8";

// 確保錢包數據目錄存在
if (!fs.existsSync(walletDataDir)) {
  fs.mkdirSync(walletDataDir, { recursive: true });
}

// 初始化網絡
function initializeNetwork(): void {
  try {
    // 指定 regtest 的 assetId(Elements Regtest native asset ID)
    const assetId = new lwk.AssetId(defaultAssetId);
    
    // 初始化 regtest 網絡
    network = lwk.Network.regtest(assetId);

    const correctUrl = "http://127.0.0.1:3102/"; // Waterfalls URL
    esplora = new lwk.EsploraClient(network, correctUrl, true);
    console.log(`網絡已初始化: ${network.toString()}`);
  } catch (error) {
    console.error("初始化網絡時出錯:", error);
  }
}

// 創建新錢包
async function createWallet(): Promise<void> {
  try {
    // 檢查是否已有錢包
    if (fs.existsSync(mnemonicFilePath)) {
      console.log("錢包已存在。如果要創建新錢包，請先刪除現有錢包或使用 'load' 命令加載現有錢包。");
      return;
    }
    
    // 創建新的助記詞
    console.log("創建新的錢包...");
    const mnemonic = lwk.Mnemonic.fromRandom(12);

    // 保存助記詞，這邊實作上應該要加密保存
    fs.writeFileSync(mnemonicFilePath, mnemonic.toString());
    
    // 創建簽名者和錢包
    signer = new lwk.Signer(mnemonic, network);
    const descriptor = signer.wpkhSlip77Descriptor();
    wollet = new lwk.Wollet(network, descriptor);
    
    console.log("新錢包已創建");
    console.log("助記詞 (請安全保存):", mnemonic.toString());
    console.log("錢包描述符:", descriptor.toString());
    
    // 獲取地址
    const addressResult = wollet.address();
    console.log("接收地址:", addressResult.address().toString());
  } catch (error) {
    console.error("創建錢包時出錯:", error);
  }
}

// 加載現有錢包
async function loadWallet(): Promise<void> {
  try {
    // 檢查是否有保存的錢包
    if (!fs.existsSync(mnemonicFilePath)) {
      console.log("找不到現有錢包。請使用 'create' 命令創建新錢包。");
      return;
    }
    
    // 從文件讀取現有助記詞，這邊實作上應該要解密
    const mnemonicString = fs.readFileSync(mnemonicFilePath, 'utf8').trim();
    
    // 創建助記詞 instance
    const mnemonic = new lwk.Mnemonic(mnemonicString);
      
    // 創建簽名者和錢包
    signer = new lwk.Signer(mnemonic, network);
    const descriptor = signer.wpkhSlip77Descriptor();
    wollet = new lwk.Wollet(network, descriptor);
    
    console.log("錢包已成功加載");
    console.log("錢包描述符:", descriptor.toString());
    
    // 獲取地址
    const addressResult = wollet.address();
    console.log("接收地址:", addressResult.address().toString());
  } catch (error) {
    console.error("加載錢包時出錯:", error);
  }
}

// 掃描區塊鏈
async function scanBlockchain(): Promise<void> {
    if (!wollet || !esplora) {
        console.log("請先加載或創建錢包");
        return;
    }
    
    try {
        console.log("掃描區塊鏈...");
        const update = await esplora.fullScanToIndex(wollet, 0);
        if (update) {
            wollet.applyUpdate(update);
            console.log("更新已應用");
        } else {
            console.log("沒有更新");
        }
    } catch (error) {
        console.error("掃描區塊鏈時出錯:", error);
    }
}

// 獲取餘額
async function getBalance() {
  try {
    if (!wollet) {
      console.log("請先加載或創建錢包");
      return;
    }

    // 更新錢包狀態
    await scanBlockchain();
    
    const balance = wollet.balance();
    console.log("餘額:", balance);
  } catch (error) {
    console.error("獲取餘額時出錯:", error);
  }
}

// 獲取地址
function getAddress(): void {
  try {
    if (!wollet) {
      console.log("請先加載或創建錢包");
      return;
    }
    
    const addressResult = wollet.address();
    console.log("接收地址:", addressResult.address().toString());
  } catch (error) {
    console.error("獲取地址時出錯:", error);
  }
}

// 發送交易
async function sendTransaction(receiver: string, amount: string, asset?: string): Promise<void> {
  try {
    if (!wollet || !signer || !esplora) {
      console.log("請先加載或創建錢包");
      return;
    }

    // 更新錢包狀態
    await scanBlockchain();
    
    // 解析金額
    const satoshi = BigInt(amount);
    
    // 創建交易構建器
    let txBuilder = network.txBuilder();
    
    // 添加接收者
    const address = new lwk.Address(receiver);
    
    // 使用 指定資產 ID 或 默認資產 ID
    const assetId = new lwk.AssetId(asset || defaultAssetId);
    txBuilder = txBuilder.addRecipient(address, satoshi, assetId);
    
    // 完成交易構建
    const pset = txBuilder.finish(wollet);
    
    // 簽名交易
    const signedPset = signer.sign(pset);
    
    // 最終化交易
    const finalizedPset = wollet.finalize(signedPset);
    
    // 廣播交易
    const txid = await esplora.broadcast(finalizedPset);
    
    console.log("交易已廣播，TXID:", txid.toString());
  } catch (error) {
    console.error("發送交易時出錯:", error);
  }
}

// 發行資產
async function issueAsset(receiver: string, amount: string): Promise<void> {
  try {
    if (!wollet || !signer || !esplora) {
      console.log("請先加載或創建錢包");
      return;
    }

    // 更新錢包狀態
    await scanBlockchain();
    
    // 解析金額: 單位為 satoshi
    const satoshi = BigInt(amount);
    
    // 獲取發行者地址
    const issuerResult = wollet.address();
    const issuerAddress = issuerResult.address();

    // 獲取接收者地址
    const receiverAddress = new lwk.Address(receiver);
    
    // 創建交易構建器
    let txBuilder = network.txBuilder();
    
    // 發行資產
    txBuilder = txBuilder.issueAsset(satoshi, receiverAddress, BigInt(1), issuerAddress);
    
    // 完成交易構建
    const pset = txBuilder.finish(wollet);
    const issuedAssetId = pset.inputs()[0].issuanceAsset()?.toString();
    console.log("發行資產 ID:", issuedAssetId);
    
    // 簽名交易
    const signedPset = signer.sign(pset);
    
    // 最終化交易
    const finalizedPset = wollet.finalize(signedPset);
    
    // 廣播交易
    const txid = await esplora.broadcast(finalizedPset);
    
    console.log("資產發行交易已廣播，TXID:", txid.toString());
  } catch (error) {
    console.error("發行資產時出錯:", error);
  }
}

// 重新發行資產
async function reissueAsset(receiver: string, amount: string, asset: string): Promise<void> {
  try {
    if (!wollet || !signer || !esplora) {
      console.log("請先加載或創建錢包");
      return;
    }

    // 更新錢包狀態
    await scanBlockchain();
    
    // 解析資產 ID 和金額
    const assetId = new lwk.AssetId(asset);
    const satoshi = BigInt(amount);
    
    // 獲取接收地址
    const address = new lwk.Address(receiver);
    
    // 創建交易構建器
    let txBuilder = network.txBuilder();
    
    // 重新發行資產
    txBuilder = txBuilder.reissueAsset(assetId, satoshi, address);
    
    // 完成交易構建
    const pset = txBuilder.finish(wollet);
    
    // 簽名交易
    const signedPset = signer.sign(pset);
    
    // 最終化交易
    const finalizedPset = wollet.finalize(signedPset);
    
    // 廣播交易
    const txid = await esplora.broadcast(finalizedPset);
    
    console.log("資產重新發行交易已廣播，TXID:", txid.toString());
  } catch (error) {
    console.error("重新發行資產時出錯:", error);
    console.error("錯誤詳情:", error instanceof Error ? error.message : String(error));
  }
}

// 銷毀資產
async function burnAsset(amount: string, asset: string): Promise<void> {
  try {
    if (!wollet || !signer || !esplora) {
      console.log("請先加載或創建錢包");
      return;
    }

    // 更新錢包狀態
    await scanBlockchain();
    
    // 解析資產 ID 和金額
    const assetId = new lwk.AssetId(asset);
    const satoshi = BigInt(amount);
    
    // 創建交易構建器
    let txBuilder = network.txBuilder();
    
    // 銷毀資產
    txBuilder = txBuilder.addBurn(satoshi, assetId);
    
    // 完成交易構建
    const pset = txBuilder.finish(wollet);
    
    // 簽名交易
    const signedPset = signer.sign(pset);
    
    // 最終化交易
    const finalizedPset = wollet.finalize(signedPset);
    
    // 廣播交易
    const txid = await esplora.broadcast(finalizedPset);
    
    console.log("資產銷毀交易已廣播，TXID:", txid.toString());
  } catch (error) {
    console.error("銷毀資產時出錯:", error);
    console.error("錯誤詳情:", error instanceof Error ? error.message : String(error));
  }
}

// 獲取交易歷史
async function getTransactions() {
  try {
    if (!wollet) {
      console.log("請先加載或創建錢包");
      return;
    }

    // 更新錢包狀態
    await scanBlockchain();
    
    const transactions = wollet.transactions();
    console.log(`交易歷史 (${transactions.length} 筆交易):`);
    
    if (transactions.length === 0) {
      console.log("沒有交易記錄");
      return;
    }
    
    transactions.forEach((tx, index) => {
      const txid = tx.txid().toString();
      const height = tx.height() !== undefined ? tx.height() : "未確認";
      const balance = tx.balance();
      
      console.log(`[${index + 1}] TXID: ${txid}`);
      console.log(`    區塊高度: ${height}`);
      console.log(`    餘額變化: ${JSON.stringify(balance)}`);
      console.log(`    手續費: ${tx.fee()}`);
      console.log(`    類型: ${tx.txType()}`);
      console.log("------------------------");
    });
  } catch (error) {
    console.error("獲取交易歷史時出錯:", error);
  }
}

// 顯示幫助信息
function showHelp(): void {
  console.log("可用命令:");
  console.log("  help                                - 顯示此幫助信息");
  console.log("  create                              - 創建新錢包");
  console.log("  load                                - 加載現有錢包");
  console.log("  scan                                - 掃描區塊鏈");
  console.log("  balance                             - 查看餘額");
  console.log("  address                             - 獲取接收地址");
  console.log("  txs                                 - 查看交易歷史");
  console.log("  send <receiver> <amount> <asset>    - 發送交易");
  console.log("  issue <receiver> <amount>           - 發行資產");
  console.log("  reissue <receiver> <amount> <asset> - 重新發行資產");
  console.log("  burn <amount> <asset>               - 銷毀資產");
  console.log("  exit                                - 退出程序");
}

// 主循環
async function mainLoop(): Promise<void> {
  console.log("歡迎使用 Liquid Wallet CLI");
  console.log("輸入 'help' 查看可用命令");
  
  // 默認初始化 testnet 網絡
  initializeNetwork();
  
  while (true) {
    const command = await new Promise<string>((resolve) => {
      rl.question('> ', (answer) => {
        resolve(answer.trim());
      });
    });
    
    const args = command.split(' ');
    const cmd = args[0].toLowerCase();
    
    switch (cmd) {
      case 'help':
        showHelp();
        break;
        
      case 'create':
        await createWallet();
        break;
        
      case 'load':
        await loadWallet();
        break;
        
      case 'scan':
        await scanBlockchain();
        break;
        
      case 'balance':
        getBalance();
        break;
        
      case 'address':
        getAddress();
        break;
        
      case 'txs':
        await getTransactions();
        break;

      case 'send':
        await sendTransaction(args[1], args[2], args[3]);
        break;

      case 'issue':
        await issueAsset(args[1], args[2]);
        break;

      case 'reissue':
        await reissueAsset(args[1], args[2], args[3]);
        break;

      case 'burn':
        await burnAsset(args[1], args[2]);
        break;

      case 'exit':
      case 'quit':
      case 'q':
        console.log("正在退出...");
        rl.close();
        return;
        
      case '':
        // 忽略空命令
        break;
        
      default:
        console.log(`未知命令: ${cmd}`);
        console.log("輸入 'help' 查看可用命令");
        break;
    }
  }
}

// 啟動主循環
mainLoop().catch(console.error).finally(() => {
  console.log("程序已退出");
  process.exit(0);
});
