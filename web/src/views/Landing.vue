<script setup>
import { RouterLink } from 'vue-router';
import Icon from '../components/Icon.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';

const features = [
  { icon: 'server', title: '机群统一管理', desc: '一个面板纳管 Windows + Linux 机器，记录连接信息、状态、算力，分组打标。' },
  { icon: 'monitor', title: 'WinRM / SSH 双通道', desc: 'Windows 自带 NTLMv2 远控（零依赖），Linux 走 SSH；也可装 OpenSSH 统一走 SSH。' },
  { icon: 'zap', title: '一键开挖', desc: '填钱包地址，勾选机器，一键安装 xmrig 并启动；批量操作并行下发。' },
  { icon: 'shield', title: '守护进程保活', desc: 'Windows watchdog：等网络就绪 + 无限重启；Linux systemd Restart=always，开机自启不掉线。' },
  { icon: 'terminal', title: 'REST API', desc: 'X-API-Key 鉴权，POST /api/v1/mine/start 一行命令触发整批挖矿，接入你自己的调度。' },
  { icon: 'sparkles', title: '双主题 UI', desc: 'Fluent 2（Win11 亚克力）与玻璃态（深色霓虹）随时切换，全局生效。' }
];

const steps = [
  { n: '01', t: '添加服务器', d: '填入 SSH 或 WinRM 连接信息，一键测试连通性。' },
  { n: '02', t: '设置钱包', d: '在设置里填入你的 c3pool XMR 收益地址。' },
  { n: '03', t: '一键开挖', d: '勾选机器点「开挖」，自动装 xmrig + 守护进程 + 开机自启。' }
];

const modules = [
  { tag: 'Module 01', t: 'C3Pool 批量挖矿', d: '已上线 · 完整的安装/启停/状态/算力/卸载', live: true },
  { tag: 'Module 02', t: '服务器监控', d: 'CPU / 内存 / 磁盘 / 网络实时监控告警', live: false },
  { tag: 'Module 03', t: '批量命令 & 脚本', d: '向机群下发任意命令/脚本，回执汇总', live: false },
  { tag: 'Module 04', t: '文件分发', d: '批量上传/同步配置与二进制', live: false }
];
</script>

<template>
  <div class="min-h-full">
    <!-- NAV -->
    <header class="sticky top-0 z-40">
      <div class="max-w-8xl mx-auto px-5 sm:px-8">
        <div class="flex items-center justify-between h-16 mt-3 px-4 glass" style="border-radius: 16px;">
          <RouterLink to="/" class="flex items-center gap-2.5 font-bold text-[17px]">
            <span class="h-9 w-9 rounded-[11px] flex items-center justify-center text-white font-extrabold"
                  style="background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 6px 18px var(--accent-soft);">⬡</span>
            <span>OpsPanel</span>
          </RouterLink>
          <nav class="hidden md:flex items-center gap-7 text-sm text-sub">
            <a href="#features" class="hover:text-accent transition-colors">功能</a>
            <a href="#how" class="hover:text-accent transition-colors">如何工作</a>
            <a href="#modules" class="hover:text-accent transition-colors">模块</a>
            <a href="https://github.com/weige2008/opspanel" target="_blank" class="hover:text-accent transition-colors inline-flex items-center gap-1.5"><Icon name="github" :size="15" /> GitHub</a>
          </nav>
          <div class="flex items-center gap-2.5">
            <ThemeSwitch compact />
            <RouterLink to="/login" class="btn btn-primary btn-sm">进入控制台 <Icon name="arrowRight" :size="15" /></RouterLink>
          </div>
        </div>
      </div>
    </header>

    <!-- HERO -->
    <section class="max-w-8xl mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-10">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div class="rise">
          <div class="badge badge-accent mb-5 inline-flex items-center gap-2"><span class="dot dot-on"></span> Module 01 · C3Pool 批量挖矿 已就绪</div>
          <h1 class="text-4xl sm:text-6xl font-extrabold leading-[1.08] tracking-tight">
            一块面板，<br />
            <span class="grad-text">纳管你的整片机群</span>
          </h1>
          <p class="mt-5 text-[16px] sm:text-lg text-sub max-w-xl leading-relaxed">
            OpsPanel 是面向 Windows / Linux 服务器机群的 Web 控制台。统一连接信息、批量运维、一键挖矿，
            开机自启 + 守护进程保活。第一模块：c3pool 批量 Monero 挖矿。
          </p>
          <div class="mt-8 flex flex-wrap items-center gap-3">
            <RouterLink to="/login" class="btn btn-primary"><Icon name="zap" :size="17" /> 立即开始</RouterLink>
            <a href="#features" class="btn btn-ghost"><Icon name="layers" :size="17" /> 了解功能</a>
            <div class="ml-1 flex items-center gap-2 text-[13px] text-muted">
              <Icon name="check" :size="15" class="text-accent" /> 默认 admin / adminadmin
            </div>
          </div>
        </div>

        <!-- floating app preview -->
        <div class="relative rise" style="animation-delay:.08s">
          <div class="glass card-hover p-3 sm:p-4" style="border-radius: 20px;">
            <div class="flex items-center gap-1.5 px-2 pb-3">
              <span class="h-3 w-3 rounded-full" style="background:#ff5f57"></span>
              <span class="h-3 w-3 rounded-full" style="background:#febc2e"></span>
              <span class="h-3 w-3 rounded-full" style="background:#28c840"></span>
              <span class="ml-3 text-[12px] text-muted font-mono">opspanel · dashboard</span>
            </div>
            <div class="glass-solid p-4" style="border-radius:14px;">
              <div class="grid grid-cols-3 gap-3 mb-3">
                <div v-for="(s, i) in [['服务器','12','server'],['挖矿中','10','cpu'],['总算力','8.4kH','activity']]" :key="i" class="p-3 rounded-[10px]" style="background:var(--fill);">
                  <div class="text-[11px] text-muted">{{ s[0] }}</div>
                  <div class="text-lg font-bold flex items-center gap-1.5"><Icon :name="s[2]" :size="14" class="text-accent" />{{ s[1] }}</div>
                </div>
              </div>
              <div class="space-y-2">
                <div v-for="row in [['gpu-node-01','yes','4120 H/s'],['win-rid','yes','3850 H/s'],['ubuntu-03','yes','2980 H/s'],['core-i9','no','—']]" :key="row[0]"
                     class="flex items-center justify-between px-3 py-2 rounded-[9px]" style="background:var(--card-2);">
                  <span class="font-mono text-[12.5px]">{{ row[0] }}</span>
                  <span class="flex items-center gap-2">
                    <span class="dot" :class="row[1]==='yes'?'dot-on':'dot-off'"></span>
                    <span class="text-[12px]" :class="row[1]==='yes'?'text-accent':'text-muted'">{{ row[2] }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="absolute -top-5 -right-3 glass px-3 py-2 text-[12px] flex items-center gap-2 card-hover" style="border-radius:12px;">
            <Icon name="shield" :size="15" class="text-accent" /> watchdog 保活
          </div>
          <div class="absolute -bottom-5 -left-3 glass px-3 py-2 text-[12px] flex items-center gap-2 card-hover" style="border-radius:12px;">
            <Icon name="terminal" :size="15" class="text-accent" /> REST API
          </div>
        </div>
      </div>
    </section>

    <!-- FEATURES -->
    <section id="features" class="max-w-8xl mx-auto px-5 sm:px-8 py-16">
      <div class="text-center max-w-2xl mx-auto mb-12">
        <div class="badge mb-4">核心能力</div>
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">为机群运维而生的控制台</h2>
        <p class="mt-3 text-sub">从连接到挖矿，从守护到 API，一条龙覆盖。</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div v-for="(f, i) in features" :key="f.title" class="glass card-hover p-6 rise" :style="`animation-delay:${i * 0.05}s`">
          <div class="h-11 w-11 rounded-[12px] flex items-center justify-center mb-4" style="background:var(--accent-soft); color:var(--accent);">
            <Icon :name="f.icon" :size="22" />
          </div>
          <h3 class="font-semibold text-[16px] mb-1.5">{{ f.title }}</h3>
          <p class="text-[13.5px] text-sub leading-relaxed">{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <!-- HOW -->
    <section id="how" class="max-w-8xl mx-auto px-5 sm:px-8 py-16">
      <div class="grid lg:grid-cols-3 gap-6">
        <div v-for="(s, i) in steps" :key="s.n" class="glass p-6 rise" :style="`animation-delay:${i * 0.06}s`">
          <div class="text-4xl font-extrabold grad-text mb-3">{{ s.n }}</div>
          <h3 class="font-semibold text-lg mb-1.5">{{ s.t }}</h3>
          <p class="text-[13.5px] text-sub leading-relaxed">{{ s.d }}</p>
        </div>
      </div>
    </section>

    <!-- MODULES -->
    <section id="modules" class="max-w-8xl mx-auto px-5 sm:px-8 py-16">
      <div class="text-center max-w-2xl mx-auto mb-12">
        <div class="badge mb-4">模块化架构</div>
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">挖矿只是第一个模块</h2>
        <p class="mt-3 text-sub">同一套机群清单之上，持续叠加运维能力。</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div v-for="m in modules" :key="m.t" class="glass card-hover p-5">
          <div class="flex items-center justify-between mb-3">
            <span class="badge" :class="m.live ? 'badge-ok' : ''">{{ m.tag }}</span>
            <span v-if="m.live" class="text-[11px] text-accent flex items-center gap-1"><span class="dot dot-on"></span>已上线</span>
            <span v-else class="text-[11px] text-muted">规划中</span>
          </div>
          <h3 class="font-semibold mb-1">{{ m.t }}</h3>
          <p class="text-[13px] text-sub leading-relaxed">{{ m.d }}</p>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="max-w-8xl mx-auto px-5 sm:px-8 py-14">
      <div class="glass-solid px-8 py-12 sm:py-14 text-center relative overflow-hidden" style="border-radius:24px;">
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">准备好了吗？</h2>
        <p class="mt-3 text-sub max-w-lg mx-auto">登录控制台，30 秒内让你的机群开始挖矿。</p>
        <div class="mt-7 flex flex-wrap justify-center gap-3">
          <RouterLink to="/login" class="btn btn-primary"><Icon name="arrowRight" :size="17" /> 进入控制台</RouterLink>
          <a href="https://github.com/weige2008/opspanel" target="_blank" class="btn btn-ghost"><Icon name="github" :size="17" /> 源码</a>
        </div>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="max-w-8xl mx-auto px-5 sm:px-8 py-10">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8" style="border-top:1px solid var(--border-soft);">
        <div class="flex items-center gap-2 text-sm text-sub">
          <span class="h-7 w-7 rounded-[9px] flex items-center justify-center text-white text-sm font-bold" style="background:linear-gradient(135deg,var(--accent),var(--accent-2));">⬡</span>
          OpsPanel · 服务器管理控制台
        </div>
        <div class="flex items-center gap-5 text-[13px] text-muted">
          <a href="https://github.com/weige2008/opspanel" target="_blank" class="hover:text-accent inline-flex items-center gap-1.5"><Icon name="github" :size="15" /> GitHub</a>
          <span>Module 01 · C3Pool</span>
        </div>
      </div>
    </footer>
  </div>
</template>
