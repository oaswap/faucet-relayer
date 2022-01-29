require("dotenv").config();

const express = require("express"),
  parser = require("body-parser"),
  http = require("http");

const Web3 = require("web3"),
  webtx = require("ethereumjs-tx").Transaction;

const web3 = new Web3(
  new Web3.providers.HttpProvider(
    `https://rinkeby.infura.io/v3/${process.env.INFURA_ID}`
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
  res.setHeader("Access-Control-Allow-Origin", "*");
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
    const tx = new webtx(txOptions, { chain: 4 });
    const privateKey = new Buffer.from(_key, "hex");
    tx.sign(privateKey);
    const serializedTx = tx.serialize();
    let txHash;

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
        contractTransactionExecutedCallback(receipt, hash);
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

// request ROSE
app.post("/requestrose", async function (req, res) {
  const requestWallet = web3.utils.toChecksumAddress(req.body.address);

  try {
    const forwarderContract = new web3.eth.Contract(abi, faucetAddr);
    const query = forwarderContract.methods.faucetWithdraw(requestWallet);
    const encodedABI = query.encodeABI();

    let requestWalletOld, requestWalletNew;

    await web3.eth.getBalance(requestWallet).then((balance) => {
      requestWalletOld = web3.utils.fromWei(balance, "ether");
    });

    const contractTransactionExecuted = async (receipt, hash) => {
      await web3.eth.getBalance(requestWallet).then((balance) => {
        requestWalletNew = web3.utils.fromWei(balance, "ether");
      });

      const obj = {
        rose_sent: requestWalletNew - requestWalletOld,
        hash: hash,
      };
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(JSON.stringify(obj));
    };

    executeContractTransaction(
      faucetAddr,
      adminWalletAddr,
      encodedABI,
      adminPrivKey,
      // web3.utils.toWei('21000', 'gwei'),
      83437,
      web3.utils.toWei("2", "gwei"),
      contractTransactionExecuted
    );
  } catch (err) {
    const obj = { rose_sent: -1 };
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify(obj));
  }

  // if (
  //   typeof req.body.receiver == "undefined" ||
  //   typeof req.body.request == "undefined"
  // ) {
  //   res.setHeader("Content-Type", "application/json");
  //   res
  //     .status(400)
  //     .send(
  //       JSON.stringify({
  //         result: "error",
  //         msg: "error in receiver and/or request fields"
  //       })
  //     );
  //   return;
  // }

  // let receiver = req.body.receiver;
  // let request = req.body.request;

  // console.log(receiver);
  // console.log(request);

  // try {
  //   const contract = new web3.eth.Contract(abi, forwarderAddr);

  //   const query = contract.methods.send(receiver, request);
  //   const encodedABI = query.encodeABI();

  //   let myeth_old, myeth_new;

  //   await web3.eth.getBalance(receiver).then(balance => {
  //     myeth_old = web3.utils.fromWei(balance, "ether");
  //   });

  //   const contractTransactionExecuted = async receipt => {
  //     await web3.eth.getBalance(receiver).then(balance => {
  //       myeth_new = web3.utils.fromWei(balance, "ether");
  //     });

  //     const obj = { ethsent: myeth_new - myeth_old };
  //     res.setHeader("Content-Type", "application/json");
  //     res.status(200).send(JSON.stringify(obj));
  //   };

  //   executeContractTransaction(
  //     forwarderAddr,
  //     adminWalletAddr,
  //     encodedABI,
  //     adminPrivKey,
  //     9000000,
  //     20000000000,
  //     5000000,
  //     contractTransactionExecuted
  //   );
  // } catch (err) {
  //   const obj = { ethsent: -1 };
  //   res.setHeader("Content-Type", "application/json");
  //   res.status(200).send(JSON.stringify(obj));
  // }
});
