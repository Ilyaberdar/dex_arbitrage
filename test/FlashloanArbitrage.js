const { expect } = require("chai");
const hre = require("hardhat");

describe("FlashloanArbitrage", function () {
  let flashloanContract, mockToken0, mockToken1, mockPool, router;
  let owner, addr1;

  const parseEther = (value) => hre.ethers.utils.parseEther(value);

  beforeEach(async () => {
    [owner, addr1] = await hre.ethers.getSigners();

    // Deploy mock tokens
    const ERC20Mock = await hre.ethers.getContractFactory("ERC20Mock");
    mockToken0 = await ERC20Mock.deploy("MockToken0", "M0", owner.address, parseEther("1000"));
    mockToken1 = await ERC20Mock.deploy("MockToken1", "M1", owner.address, parseEther("1000"));

    // Deploy mock router
    const RouterMock = await hre.ethers.getContractFactory("SwapRouterMock");
    router = await RouterMock.deploy(mockToken0.address, mockToken1.address);

    // Deploy mock Uniswap pool
    const PoolMock = await hre.ethers.getContractFactory("UniswapPoolMock");
    mockPool = await PoolMock.deploy();

    // Deploy arbitrage contract
    const FlashloanArbitrage = await hre.ethers.getContractFactory("FlashloanArbitrage");
    flashloanContract = await FlashloanArbitrage.deploy(mockPool.address, router.address);

    // Set the flashloan target in the mock pool
    await mockPool.setTarget(flashloanContract.address);
  });

  it("should deploy successfully", async () => {
    expect(await flashloanContract.UNISWAP_POOL()).to.equal(mockPool.address);
    expect(await flashloanContract.UNISWAP_ROUTER()).to.equal(router.address);
  });

  it("should return 0 balance initially", async () => {
    expect(await flashloanContract.getBalance(mockToken0.address)).to.equal(0);
  });

  it("should allow owner to withdraw ERC20 tokens", async () => {
    await mockToken0.transfer(flashloanContract.address, parseEther("10"));
    expect(await flashloanContract.getBalance(mockToken0.address)).to.equal(parseEther("10"));

    await flashloanContract.withdrawToken(mockToken0.address);
    expect(await mockToken0.balanceOf(owner.address)).to.equal(parseEther("1000"));
  });

  it("should allow ETH withdrawals", async () => {
    await owner.sendTransaction({
      to: flashloanContract.address,
      value: parseEther("1")
    });

    const balBefore = await hre.ethers.provider.getBalance(owner.address);
    const tx = await flashloanContract.withdrawETH();
    const receipt = await tx.wait();

    const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
    const balAfter = await hre.ethers.provider.getBalance(owner.address);

    expect(balAfter.add(gasUsed).sub(balBefore)).to.be.closeTo(
      parseEther("1"),
      parseEther("0.01")
    );
  });

  it("should revert flashloan if not profitable", async () => {
    await expect(
      flashloanContract.requestFlashLoan(
        mockToken0.address,
        mockToken1.address,
        parseEther("1"),
        0
      )
    ).to.be.revertedWith("Token0: Not profitable");
  });
});
