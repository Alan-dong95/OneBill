interface IAppOption {
  globalData: {
    token: string;
  };
}

/** 微信同声传译等插件入口 */
declare function requirePlugin(name: string): any;
