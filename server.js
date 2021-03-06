require("dotenv").config();
const fetch = require("node-fetch");

const express = require("express"),
  parser = require("body-parser"),
  http = require("http");

const Web3 = require("web3"),
  webtx = require("ethereumjs-tx").Transaction,
  Common = require("ethereumjs-common").default;

const web3 = new Web3(
  new Web3.providers.HttpProvider(
    `https://rinkeby.infura.io/v3/${process.env.INFURA_ID}`
    // "https://emerald.oasis.dev"
  )
);

const adminWalletAddr = process.env.ADMIN_ADDRESS;
const adminPrivKey = process.env.PRIV_KEY;
const abi = require("./oaswap_faucet.json");
const faucetAddr = process.env.FAUCET_ADDRESS;

const app = express();
// app.use(express.json());
app.use(parser.json());
app.use(parser.urlencoded({ extended: true }));
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "https://oaswap.finance");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,Content-Type"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

app.set("port", process.env.PORT || 5000);

const executeContractTransaction = async (
  _contractAddress,
  _wallet,
  _encodedABI,
  _key,
  _gasLimit,
  _gasPrice,
  // _gas,
  contractTransactionExecutedCallback
) => {
  web3.eth.getTransactionCount(_wallet).then((txCount) => {
    const txOptions = {
      from: _wallet,
      to: _contractAddress,
      nonce: web3.utils.toHex(txCount),
      gasLimit: web3.utils.toHex(_gasLimit),
      gasPrice: web3.utils.toHex(_gasPrice),
      // gas: web3.utils.toHex(_gas),
      data: _encodedABI,
    };
    const customCommon = Common.forCustomChain(
      "mainnet",
      {
        name: "Oasis Emerald",
        networkId: 42262,
        chainId: 42262,
      },
      "istanbul"
    );
    // const tx = new webtx(txOptions, { chain: process.env.CHAIN_ID });
    const tx = new webtx(txOptions, { common: customCommon });
    const privateKey = new Buffer.from(_key, "hex");
    tx.sign(privateKey);
    const serializedTx = tx.serialize();
    let txHash = "";

    web3.eth
      .sendSignedTransaction("0x" + serializedTx.toString("hex"))
      // .on("confirmation", (confirmationNumber, receipt) => {
      //   console.log("=> confirmation: " + confirmationNumber);
      // })
      .on("transactionHash", (hash) => {
        console.log("=> hash");
        console.log(hash);
        txHash = hash;
      })
      .on("error", console.error)
      .then((receipt) => {
        //console.log('=> reciept');
        // console.log(receipt);
        contractTransactionExecutedCallback(receipt, txHash);
      });
  });
};

// Set default route
app.get("/", function (req, res) {
  res.send(
    "<html><body><p>Welcome to the Oaswap ROSE Faucet</p></body></html>"
  );
});

// Create server
http.createServer(app).listen(app.get("port"), function () {
  console.log("Server listening on port " + app.get("port"));
});

// State ETH balance in faucet
app.post("/ethers", function (req, res) {
  try {
    web3.eth.getBalance(forwarderAddr).then((balance) => {
      res.setHeader("Content-Type", "application/json");
      res
        .status(200)
        .send(
          JSON.stringify({ ethbalance: web3.utils.fromWei(balance, "ether") })
        );
    });
  } catch (err) {
    const obj = { ethbalance: -1 };
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(obj));
  }
});

// Request ROSE
app.post("/requestrose", async function (req, res) {
  if (
    typeof req.body.address == "undefined" ||
    typeof req.body.recaptcha == "undefined"
  ) {
    res.setHeader("Content-Type", "application/json");
    res.status(400).send(
      JSON.stringify({
        result: "Error",
        msg: "Error in address field",
      })
    );
    return;
  }

  const requestWallet = web3.utils.toChecksumAddress(req.body.address);
  const recaptchaToken = req.body.recaptcha;
  console.log(recaptchaToken);

  const recaptchaVerification = await checkRecaptcha(recaptchaToken);
  console.log("recaptchaVerification", recaptchaVerification);

  // try {
  //   const forwarderContract = new web3.eth.Contract(abi, faucetAddr);
  //   const query = forwarderContract.methods.faucetWithdraw(requestWallet);
  //   const encodedABI = query.encodeABI();

  //   let requestWalletOld, requestWalletNew;

  //   await web3.eth.getBalance(requestWallet).then((balance) => {
  //     requestWalletOld = web3.utils.fromWei(balance, "ether");
  //   });

  //   const contractTransactionExecuted = async (receipt, hash) => {
  //     await web3.eth.getBalance(requestWallet).then((balance) => {
  //       requestWalletNew = web3.utils.fromWei(balance, "ether");
  //     });

  //     const obj = {
  //       rose_sent: requestWalletNew - requestWalletOld,
  //       hash: hash,
  //     };
  //     res.setHeader("Content-Type", "application/json");
  //     res.status(200).send(JSON.stringify(obj));
  //   };

  //   executeContractTransaction(
  //     faucetAddr,
  //     adminWalletAddr,
  //     encodedABI,
  //     adminPrivKey,
  //     // web3.utils.toWei('21000', 'gwei'),
  //     212893,
  //     web3.utils.toWei("10", "gwei"),
  //     contractTransactionExecuted
  //   );
  // } catch (err) {
  //   const obj = { rose_sent: -1 };
  //   res.setHeader("Content-Type", "application/json");
  //   res.status(200).send(JSON.stringify(obj));
  // }
});

// Verify ReCAPTCHA token
app.post("/verifyrecaptcha", async function (req, res) {
  if (typeof req.body.token == "undefined") {
    res.setHeader("Content-Type", "application/json");
    res.status(400).send(
      JSON.stringify({
        result: "Error",
        msg: "Error in token field",
      })
    );
    return;
  }

  const responseKey = req.body.token;
  const secretKey = process.env.RECAPTCHA_SECRET;
  const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${responseKey}`;

  try {
    await fetch(verifyUrl, {
      method: "POST",
      // mode: "cors",
      // body: JSON.stringify(tokenRequest),
      // headers: { "Content-Type": "application/text" },
    })
      .then((response) => response.json())
      .then((response) => {
        // const jsonRes = JSON.parse(response);
        // console.log("response", response);
        res.setHeader("Content-Type", "application/json");
        res.status(200).send(response);
      })
      .catch((error) => console.log(error));
  } catch (error) {
    console.log(error);
    res.setHeader("Content-Type", "application/json");
    res.status(400).send(
      JSON.stringify({
        result: "Error",
        msg: "Token verification failed",
      })
    );
  }
});

async function checkRecaptcha(responseKey) {
  const secretKey = process.env.RECAPTCHA_SECRET;
  const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${responseKey}`;

  try {
    await fetch(verifyUrl, {
      method: "POST",
    })
      .then((response) => response.json())
      .then((response) => {
        // const jsonRes = JSON.parse(response);
        console.log("response", response);
      })
      .catch((error) => console.log(error));
  } catch (error) {
    console.log(error);
    res.setHeader("Content-Type", "application/json");
    res.status(400).send(
      JSON.stringify({
        result: "Error",
        msg: "Token verification failed",
      })
    );
  }
}
