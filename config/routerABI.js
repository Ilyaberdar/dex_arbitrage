export const ROUTER_ABI = [
    {
      name: 'getAmountsOut',
      type: 'function',
      inputs: [
        { name: 'amountIn', type: 'uint256' },
        { name: 'path', type: 'address[]' }
      ],
      outputs: [
        { name: 'amounts', type: 'uint256[]' }
      ],
      stateMutability: 'view'
    }
  ];
  