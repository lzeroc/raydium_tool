<template>
  <div id="app">
    <HelloWorld msg="GRAPE 中奖查询" />
    <el-row>
      输入示例（回车增加新地址）：
      <br />
    </el-row>
    <el-row style="margin: 10px 0;">
      HuZx3keBd2b7BnXo38vXn8zuintSbYGs3hoLRe5Es54g
      <br />GDr9QWSJmhjwwWZQ6q893LBG9RcuseG1rL8r24BuQ77p
      <br />AaP9JVVDhVM68FK21iHknzYPvof4mH9xchwLGUMcieeL
    </el-row>
    <el-input type="textarea" :rows="15" v-model="desc"></el-input>
    <el-button type="success" @click="test()" style="margin-top: 20px;" :loading="loading">查询</el-button>
    <el-button type="danger" @click="reload()">重置</el-button>
    <el-row style="margin-top: 20px;">
      中奖总票数
      <el-tag>{{ count }}</el-tag>
    </el-row>
    <el-table :data="tableData" style="width: 100%">
      <el-table-column prop="address" label="地址" width="180"></el-table-column>
      <el-table-column prop="allCount" label="总票数" width="180"></el-table-column>
      <el-table-column prop="winCount" label="中奖票数"></el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import HelloWorld from "./components/HelloWorld.vue";
import { query } from "./fund";

@Component({
  components: {
    HelloWorld
  }
})
export default class App extends Vue {
  desc = "";
  tableData: any = [];
  loading = false;
  count = 0;

  async asyncData() {}
  reload() {
    location.reload();
  }
  async test() {
    this.tableData = [];
    this.loading = true;
    this.count = 0;

    let arr = this.desc.split(/[(\r\n\s)\r\n\s]+/);
    let count = 0;
    for (let temp of arr) {
      if (temp.trim().length > 0) {
        let { allCount, winCount, address } = await query(temp.trim());
        this.tableData.push({
          address: address,
          allCount: allCount,
          winCount: winCount
        });
        count += winCount;
      }
    }
    this.count = count;
    this.loading = false;
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
