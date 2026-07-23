# KaTeX 公式渲染样例

> 在 MDA GUI 中打开本文件，查看行内 `$…$` 与块级 `$$…$$` 的渲染效果。  
> 启动：`npm run gui -- samples/katex.md`

## 行内公式

爱因斯坦质能关系：$E = mc^2$。

勾股定理：$a^2 + b^2 = c^2$，其中直角边为 $a$、$b$，斜边为 $c$。

概率论中常用：$P(A \mid B) = \dfrac{P(B \mid A)\,P(A)}{P(B)}$。

## 块级公式

### 求和与极限

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

$$
\lim_{x \to 0} \frac{\sin x}{x} = 1
$$

### 积分与微分

$$
\int_{0}^{1} x^{2}\,dx = \frac{1}{3}
$$

$$
\frac{d}{dx}\bigl(e^{ax}\bigr) = a\,e^{ax}
$$

### 矩阵与行列式

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$

$$
\det\begin{vmatrix}
1 & 2 & 3 \\
0 & 1 & 4 \\
5 & 6 & 0
\end{vmatrix}
= 1
$$

### 分段函数

$$
f(x) =
\begin{cases}
x^{2}, & x \ge 0 \\
-x, & x < 0
\end{cases}
$$

### 对齐等式

$$
\begin{aligned}
(a + b)^{2}
&= a^{2} + 2ab + b^{2} \\
&= a(a + 2b) + b^{2}
\end{aligned}
$$

## 物理公式

### 力学与电磁

牛顿第二定律：$F = ma$。万有引力：

$$
F = G\frac{m_1 m_2}{r^{2}}
$$

动能与动量：

$$
E_k = \frac{1}{2}mv^{2},\quad
p = mv,\quad
E_k = \frac{p^{2}}{2m}
$$

库仑定律与电场：

$$
F = k\frac{q_1 q_2}{r^{2}},\quad
\vec{E} = \frac{\vec{F}}{q}
$$

### 波动与量子

波速关系：$v = f\lambda$。薛定谔方程（一维定态）：

$$
-\frac{\hbar^{2}}{2m}\frac{d^{2}\psi}{dx^{2}} + V(x)\psi = E\psi
$$

德布罗意关系与不确定原理：

$$
\lambda = \frac{h}{p},\quad
\Delta x\,\Delta p \ge \frac{\hbar}{2}
$$

### 热力学

理想气体状态方程：$PV = nRT$。熵变（可逆）：

$$
\Delta S = \int \frac{dQ_{\mathrm{rev}}}{T}
$$

麦克斯韦方程组（真空，微分形式摘录）：

$$
\begin{aligned}
\nabla \cdot \vec{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \vec{B} &= 0 \\
\nabla \times \vec{E} &= -\frac{\partial \vec{B}}{\partial t} \\
\nabla \times \vec{B} &= \mu_0\vec{J} + \mu_0\varepsilon_0\frac{\partial \vec{E}}{\partial t}
\end{aligned}
$$

## 化学公式

> 说明：未启用 `mhchem` 扩展时，用下标/箭头手写反应式；若预览异常，以本节手写式为准。

### 分子与反应式

水与二氧化碳：$H_2O$、$CO_2$、$CaCO_3$。

酸碱中和：

$$
HCl + NaOH \rightarrow NaCl + H_2O
$$

可逆与催化（示意）：

$$
N_2 + 3H_2 \rightleftharpoons 2NH_3
$$

燃烧：

$$
C_xH_y + \Bigl(x + \frac{y}{4}\Bigr)O_2 \rightarrow x\,CO_2 + \frac{y}{2}H_2O
$$

### 平衡与热力学

化学平衡常数：

$$
K_c = \frac{[C]^{c}[D]^{d}}{[A]^{a}[B]^{b}}
\quad\text{（对 } aA + bB \rightleftharpoons cC + dD\text{）}
$$

能斯特方程（简化）：

$$
E = E^{\circ} - \frac{RT}{nF}\ln Q
$$

pH 定义与弱酸近似：

$$
\mathrm{pH} = -\log_{10}[H^{+}],\quad
\mathrm{pH} \approx \frac{1}{2}\bigl(\mathrm{p}K_a - \log c\bigr)
$$

阿伦尼乌斯方程：

$$
k = A\,e^{-E_a/(RT)}
$$

## 生物 / 生化合式

### 种群与遗传

指数增长与 Logistic：

$$
\frac{dN}{dt} = rN,\quad
\frac{dN}{dt} = rN\Bigl(1 - \frac{N}{K}\Bigr)
$$

Hardy–Weinberg：$p^{2} + 2pq + q^{2} = 1$，其中 $p + q = 1$。

### 酶动力学与膜电位

Michaelis–Menten：

$$
v = \frac{V_{\max}[S]}{K_m + [S]}
$$

Lineweaver–Burk：

$$
\frac{1}{v} = \frac{K_m}{V_{\max}}\cdot\frac{1}{[S]} + \frac{1}{V_{\max}}
$$

Nernst 电位（一价离子）：

$$
E = \frac{RT}{zF}\ln\frac{[C]_{\mathrm{out}}}{[C]_{\mathrm{in}}}
\approx \frac{58\,\mathrm{mV}}{z}\log_{10}\frac{[C]_{\mathrm{out}}}{[C]_{\mathrm{in}}}
$$

### 信息分子与光合（示意）

ATP 水解（示意）：

$$
\mathrm{ATP} + H_2O \rightarrow \mathrm{ADP} + P_i + \text{能量}
$$

光合作用总反应：

$$
6CO_2 + 6H_2O \xrightarrow{\text{光}} C_6H_{12}O_6 + 6O_2
$$

碱基配对（示意，非化学计量）：$A$–$T$（2 氢键）、$G$–$C$（3 氢键）；链长可用 $n$ 表示碱基对数。

## 常见符号速览

| 类别 | 行内示例 |
|------|----------|
| 希腊字母 | $\alpha,\beta,\gamma,\Delta,\Omega$ |
| 上下标 | $x_i^{(n)}$、$e^{-i\omega t}$ |
| 分数根号 | $\sqrt{2}$、$\dfrac{1}{1+x}$ |
| 集合 | $A \cup B$、$\mathbb{R}^{n}$、$\emptyset$ |
| 关系 | $x \approx y$、$\forall x\,\exists y$ |

## 与正文混排

打开区间 $(0, 1)$ 上，连续函数 $f$ 满足：

$$
\int_{0}^{1} f(x)\,dx = F(1) - F(0)
$$

其中 $F' = f$。若 $f$ 在代码围栏内写成 `$E=mc^2$`，应保持为**字面文本**（不渲染）：

```text
围栏内：$E = mc^2$ 不应变成公式。
```

## 超宽公式滚动

下式用于检查块级公式卡片在窄预览栏内横向滚动，而不是撑破正文：

$$
\mathcal{L}(\theta)=\sum_{i=1}^{N}\left[y_i\log\sigma\!\left(\sum_{j=1}^{M}\theta_j x_{ij}+b\right)+(1-y_i)\log\left(1-\sigma\!\left(\sum_{j=1}^{M}\theta_j x_{ij}+b\right)\right)\right]+\lambda\sum_{j=1}^{M}\theta_j^2
$$

## 建议你点的几下

1. 预览区看行内与块级是否对齐、字号是否清晰  
2. 深色主题下公式颜色是否可读  
3. 大纲跳到「物理 / 化学 / 生物」各小节再回来，确认预览不错位  
4. 对照「矩阵与行列式」与「麦克斯韦方程组」等多行 `aligned` 是否换行正常  
5. 缩窄预览栏，确认「超宽公式滚动」只在卡片内横向滚动
