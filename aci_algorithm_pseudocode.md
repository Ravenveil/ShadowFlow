# ACI Causal Influence Range (CIR) — Complete Algorithm Pseudocode

Extracted from `noisy_predator_prey_model.m` (1332 lines, MIT License)
Reference: "Assimilative Causal Inference" by Marios Andreou, Nan Chen, Erik Bollt
GitHub: https://github.com/marandmath/ACI_code

**Note:** No `dyad_interaction_model.m` was found in the ACI_code directory.
The predator-prey model covers the complete CGNS (Conditional Gaussian Nonlinear System)
case with scalar unobservable. For the general multi-variable dyadic case, the same
algorithms apply but with matrix operations instead of scalar — see remarks at the end.

---

## 0. Model Setup — Predator-Prey (Lotka-Volterra with Noise)

The system is a pair of coupled SDEs:
```
dx = (β·y·x - α·x)·dt + σ_x·dW_x          (predator)
dy = (γ·y - δ·y·x)·dt + σ_y·dW_y          (prey)
```

**To study causal direction X→Y** (y observed, x unobserved):
- Observable process: y(t)  with  dy = (L_y·x + f_y)·dt + Sy_1·dW_x + Sy_2·dW_y
- Unobservable process: x(t) with dx = (L_x·x + f_x)·dt + Sx_1·dW_x + Sx_2·dW_y

Where at each timestep j:
```python
# Time-dependent coefficients (x→y case):
L_y[j] = -δ * y[j]            # observable drift coeff (depends on observed y)
f_y[j] = γ * y[j]             # observable forcing (depends on observed y)
L_x[j] = β * y[j] - α         # unobservable drift coeff (depends on observed y)
f_x   = 0                      # unobservable forcing (constant)

# Noise matrices:
Sy_1 = 0;  Sy_2 = σ_y          # observable noise
Sx_1 = σ_x;  Sx_2 = 0          # unobservable noise
```

**To study Y→X** (x observed, y unobserved) — swap roles:
```python
L_x[j] = β * x[j]             # observable drift coeff
f_x[j] = -α * x[j]             # observable forcing
L_y[j] = γ - δ * x[j]          # unobservable drift coeff
f_y   = 0                       # unobservable forcing
Sy_1 = 0;  Sy_2 = σ_y           # unobservable noise
Sx_1 = σ_x;  Sx_2 = 0           # observable noise
```

---

## 1. Kalman Filter for CGNS (Forward Pass)

Computes the posterior filter mean μⱼ and covariance Rⱼ of the unobservable
variable conditioned on all observations up to time j.

### 1.1 Pre-computation (noise Grammians)

```python
def precompute_noise_grammians(Sx_1, Sx_2, Sy_1, Sy_2):
    """
    For X→Y case: observable_noise = y, unobservable_noise = x
    For Y→X case: swap the labels
    """
    S_oo = Sy_1**2 + Sy_2**2           # sum of Grammians of observable noise
    S_oo_inv = 1.0 / S_oo              # inverse (scalar case)
    S_uu = Sx_1**2 + Sx_2**2           # sum of Grammians of unobservable noise
    S_uo = Sx_1 * Sy_1 + Sx_2 * Sy_2  # cross-interaction u→o
    S_ou = S_uo                         # scalar: symmetric
    return S_oo, S_oo_inv, S_uu, S_uo, S_ou
```

### 1.2 Filter Loop

```python
def kalman_filter_cgns(N, dt, obs_series, L_u, L_o, f_u, f_o,
                       S_oo_inv, S_uu, S_uo, filter_mean_init, filter_cov_init):
    """
    Kalman filter for Conditional Gaussian Nonlinear Systems.

    Args:
        N:              number of timesteps (indices 1..N+1)
        dt:             timestep
        obs_series:     observed variable array [N+1] (y for X→Y, x for Y→X)
        L_u[j]:         unobservable drift coefficient at j
        L_o[j]:         observable drift coefficient at j
        f_u:            unobservable forcing (scalar or array)
        f_o[j]:         observable forcing at j
        S_oo_inv:       inverse of observable noise Grammian sum
        S_uu:           unobservable noise Grammian sum
        S_uo:           cross noise interaction u→o
        filter_mean_init: initial filter mean (e.g. x[0] or y[0])
        filter_cov_init:  initial filter covariance (e.g. 0.1)

    Returns:
        filter_mean: array[N+1], filter_cov: array[N+1]
    """
    filter_mean = np.zeros(N + 1)
    filter_cov  = np.zeros(N + 1)
    filter_mean[0] = filter_mean_init
    filter_cov[0]  = filter_cov_init

    mu = filter_mean_init
    R  = filter_cov_init

    for j in range(1, N + 1):          # j = 2..N+1 in MATLAB (1-indexed)
        dobs = obs_series[j] - obs_series[j-1]     # Δy or Δx
        aux = S_uo + R * L_o[j-1]                   # cross-covariance correction

        # Filter mean update:
        mu = mu + (L_u[j-1] * mu + f_u_val(j-1)) * dt \
                + aux * S_oo_inv * (dobs - (L_o[j-1] * mu + f_o[j-1]) * dt)

        # Filter covariance update:
        R = R + (L_u[j-1] * R + R * L_u[j-1] + S_uu \
                 - aux * S_oo_inv * aux) * dt

        filter_mean[j] = mu
        filter_cov[j]  = R

    return filter_mean, filter_cov
```

**Key insight:** This is an extended Kalman-Bucy filter continuous-discrete formulation
adapted for CGNS. The correction term `aux * S_oo_inv * (dobs - predicted_dobs)` is the
Kalman gain times innovation. For scalar case, all products commute; for matrix case,
order matters.

---

## 2. Rauch-Tung-Striebel Backward Smoother (RTS)

Computes the posterior smoother mean μⱼ^s and covariance Rⱼ^s of the unobservable
variable conditioned on ALL observations (past and future).

### 2.1 Smoother Loop (with online auxiliary matrices for CIR)

```python
def rts_smoother_cgns(N, dt, obs_series,
                      filter_mean, filter_cov,
                      L_u, L_o, f_u, f_o,
                      S_oo_inv, S_uu, S_uo, S_ou):
    """
    RTS backward smoother for CGNS + online smoother auxiliary matrices E_j, F_j.

    The E_j and F_j matrices are the CGNS online smoother update coefficients
    needed later for CIR computation.

    Args:
        All filter outputs + model coefficients as in filter.
        S_ou: cross noise interaction o→u (equals S_uo for scalar)

    Returns:
        smoother_mean, smoother_cov: arrays[N+1]
        E_j_matrices, F_j_matrices: arrays[N+1]  (online smoother auxiliaries)
    """
    smoother_mean = np.zeros(N + 1)
    smoother_cov  = np.zeros(N + 1)
    E_j = np.zeros(N + 1)
    F_j = np.zeros(N + 1)

    # Initialize at final time T = N+1
    smoother_mean[N] = filter_mean[N]
    smoother_cov[N]  = filter_cov[N]

    # Compute E, F at terminal time
    G_o_j = L_o[N] + S_ou / filter_cov[N]
    G_u_j = L_u[N] + S_uu / filter_cov[N]
    C_jj  = 1.0 - G_u_j * dt
    H_j   = filter_cov[N] / (L_u[N] * filter_cov[N] + filter_cov[N] * L_u[N] + S_uu)
    K_j   = S_oo_inv * G_o_j
    E_j[N] = C_jj + S_uo * K_j * dt
    F_j[N] = -filter_cov[N] * (
        K_j + (G_o_j * K_j * filter_cov[N] * K_j
               - filter_cov[N] / (L_u[N]*filter_cov[N] + filter_cov[N]*L_u[N] + S_uu)
                 * filter_cov[N] * K_j
               + L_u[N] * K_j) * dt
        - L_o[N] * (S_oo_inv + K_j * filter_cov[N] * K_j * dt)
    )

    muT = smoother_mean[N]
    RT  = smoother_cov[N]

    for j in range(N - 1, -1, -1):       # j = N down to 1 (MATLAB: N:-1:1)
        # Online smoother auxiliary matrices at j
        G_o_j = L_o[j] + S_ou / filter_cov[j]
        G_u_j = L_u[j] + S_uu / filter_cov[j]
        C_jj  = 1.0 - G_u_j * dt
        H_j   = filter_cov[j] / (L_u[j]*filter_cov[j] + filter_cov[j]*L_u[j] + S_uu)
        K_j   = S_oo_inv * G_o_j
        E_j[j] = C_jj + S_uo * K_j * dt
        F_j[j] = -filter_cov[j] * (
            K_j + (G_o_j * K_j * filter_cov[j] * K_j
                   - filter_cov[j] / (L_u[j]*filter_cov[j] + filter_cov[j]*L_u[j] + S_uu)
                     * filter_cov[j] * K_j
                   + L_u[j] * K_j) * dt
            - L_o[j] * (S_oo_inv + K_j * filter_cov[j] * K_j * dt)
        )

        dobs = obs_series[j+1] - obs_series[j]
        A_j = L_u[j] - S_uo * S_oo_inv * L_o[j]
        B_j = S_uu - S_uo * S_oo_inv * S_ou

        # Smoother mean update:
        mu = muT - (L_u[j] * muT + f_u_val(j)
                     - B_j / filter_cov[j] * (filter_mean[j] - muT)) * dt \
             + S_uo * S_oo_inv * (-dobs + (L_o[j] * muT + f_o[j]) * dt)

        # Smoother covariance update:
        R = RT - ((A_j + B_j / filter_cov[j]) * RT
                  + RT * (A_j + B_j / filter_cov[j])
                  - B_j) * dt

        smoother_mean[j] = mu
        smoother_cov[j]  = R
        muT = mu
        RT  = R

    return smoother_mean, smoother_cov, E_j, F_j
```

---

## 3. ACI Metric Computation

The ACI (Assimilative Causal Inference) metric at each time step is the KL divergence
between the smoother and filter distributions of the unobservable variable.

```python
def compute_aci_metric(smoother_mean, filter_mean, smoother_cov, filter_cov):
    """
    ACI metric = KL(smoother || filter) at each timestep.
    For Gaussians: KL = 0.5 * (Δμ²/σ²_f + σ²_s/σ²_f - 1 - ln(σ²_s/σ²_f))
    """
    signal_term = 0.5 * (smoother_mean - filter_mean)**2 / filter_cov
    cov_ratio = smoother_cov / filter_cov
    dispersion_term = 0.5 * (-np.log(cov_ratio) + cov_ratio - 1.0)
    aci_metric = signal_term + dispersion_term
    return aci_metric
```

---

## 4. Online (Fixed-Lag) Smoother for CGNS

The online smoother computes pₙ(uʲ | obs[1:n]) for all n and all j ≤ n.
This is needed for CIR because we need the posterior at every intermediate
observation count, not just the final one.

### 4.1 Data Structure

In MATLAB, staggered cell arrays are used. In Python, use a list of arrays:

```python
# online_fixed_mean[n]  = array of length n   (means for j=0..n-1)
# online_fixed_cov[n]   = array of length n   (covariances for j=0..n-1)
# update_matrices_fixed[n] = array of length n+1 (for n >= 2)
```

### 4.2 Online Smoother Algorithm

```python
def online_fixed_lag_smoother_cgns(N, dt, obs_series,
                                   filter_mean, filter_cov,
                                   E_j_matrices, F_j_matrices,
                                   L_u, L_o, f_u, f_o):
    """
    Fixed-lag online smoother for CGNS.
    With fixed_lag = N+1 (full backward), this computes the complete
    set of intermediate smoother distributions.

    Returns:
        online_fixed_mean: list of arrays, online_fixed_mean[n][j] = mean
        online_fixed_cov:  list of arrays, online_fixed_cov[n][j]  = cov
    """
    fixed_lag = N + 1  # full backward pass

    # Initialize staggered arrays
    online_fixed_mean = [None] * (N + 1)
    online_fixed_cov  = [None] * (N + 1)
    update_matrices  = [None] * (N - 1)

    for n in range(1, N):
        update_matrices[n-1] = np.zeros(n + 1)
        online_fixed_mean[n] = np.zeros(n)
        online_fixed_cov[n]  = np.zeros(n)
    for n in range(N, N + 1):
        online_fixed_mean[n] = np.zeros(n)
        online_fixed_cov[n]  = np.zeros(n)

    # n=1: single observation
    online_fixed_mean[1][0] = filter_mean[0]
    online_fixed_cov[1][0]  = filter_cov[0]

    # n=2: two observations
    online_fixed_mean[2][1] = filter_mean[1]
    online_fixed_cov[2][1]  = filter_cov[1]

    if fixed_lag == 0:
        online_fixed_mean[2][0] = online_fixed_mean[1][0]
        online_fixed_cov[2][0]  = online_fixed_cov[1][0]
    else:
        # j-1 = 0 in MATLAB indexing (j=1)
        aux_vec = (filter_mean[0]
                   - E_j_matrices[0] * ((1 + L_u[0]*dt) * filter_mean[0] + f_u_val(0) * dt)
                   + F_j_matrices[0] * (obs_series[1] - obs_series[0]
                                        - (L_o[0]*filter_mean[0] + f_o[0]) * dt))
        online_fixed_mean[2][0] = E_j_matrices[0] * filter_mean[1] + aux_vec

        aux_mat = (filter_cov[0]
                   - E_j_matrices[0] * (1 + L_u[0]*dt) * filter_cov[0]
                   - F_j_matrices[0] * L_o[0] * filter_cov[0] * dt)
        online_fixed_cov[2][0] = E_j_matrices[0] * filter_cov[1] * E_j_matrices[0] + aux_mat

    # Main loop: n = 3 to N+1
    for n in range(3, N + 1):
        idx_n = n - 1   # 0-indexed array index for time n (MATLAB index n)

        online_fixed_mean[n][idx_n] = filter_mean[idx_n]
        online_fixed_cov[n][idx_n]  = filter_cov[idx_n]

        if fixed_lag == 0:
            online_fixed_mean[n][idx_n - 1] = online_fixed_mean[n-1][idx_n - 1]
            online_fixed_cov[n][idx_n - 1]  = online_fixed_cov[n-1][idx_n - 1]
        else:
            # Update j = n-1 (the penultimate time)
            j_prev = idx_n - 1  # index of j = n-1
            aux_vec = (filter_mean[j_prev]
                       - E_j_matrices[j_prev] * ((1 + L_u[j_prev]*dt) * filter_mean[j_prev]
                                                  + f_u_val(j_prev) * dt)
                       + F_j_matrices[j_prev] * (obs_series[idx_n] - obs_series[j_prev]
                                                  - (L_o[j_prev]*filter_mean[j_prev]
                                                     + f_o[j_prev]) * dt))
            online_fixed_mean[n][j_prev] = E_j_matrices[j_prev] * filter_mean[idx_n] + aux_vec

            aux_mat = (filter_cov[j_prev]
                       - E_j_matrices[j_prev] * (1 + L_u[j_prev]*dt) * filter_cov[j_prev]
                       - F_j_matrices[j_prev] * L_o[j_prev] * filter_cov[j_prev] * dt)
            online_fixed_cov[n][j_prev] = E_j_matrices[j_prev]**2 * filter_cov[idx_n] + aux_mat

        # Propagate updates backward: j = n-2 down to 1
        for j in range(idx_n - 1, 0, -1):
            if j <= idx_n - fixed_lag:
                # Beyond the fixed-lag window: no update needed
                online_fixed_mean[n][j] = online_fixed_mean[n-1][j]
                online_fixed_cov[n][j]  = online_fixed_cov[n-1][j]
            else:
                # Within the fixed-lag window
                um_idx = n - 2  # index into update_matrices (MATLAB: {n-2})
                if j == idx_n - 1:
                    update_matrices[um_idx][j] = 1.0
                elif j == idx_n - 2:
                    update_matrices[um_idx][j] = E_j_matrices[j]
                else:
                    update_matrices[um_idx][j] = update_matrices[um_idx - 1][j] * E_j_matrices[idx_n - 2]

                online_mean_inov = online_fixed_mean[n][idx_n - 1] - filter_mean[idx_n - 1]
                online_fixed_mean[n][j] = online_fixed_mean[n-1][j] + update_matrices[um_idx][j] * online_mean_inov

                online_cov_inov = online_fixed_cov[n][idx_n - 1] - filter_cov[idx_n - 1]
                online_fixed_cov[n][j] = online_fixed_cov[n-1][j] + update_matrices[um_idx][j]**2 * online_cov_inov

    return online_fixed_mean, online_fixed_cov
```

**Important:** For `fixed_lag = N+1`, the condition `j <= n-1-fixed_lag` is never true
(since j ≥ 1 and fixed_lag > n-1), so ALL indices get updated at every step. This is the
most expensive but most accurate setting for CIR computation.

---

## 5. CIR Computation — Subjective and Objective

### 5.1 Relative Entropy Metric Pₙʲ (Kullback-Leibler Divergence)

The core quantity is the KL divergence between:
- p_N(uʲ | obs[1:N]) — posterior with ALL observations (online smoother at n=N)
- p_n(uʲ | obs[1:n]) — posterior with observations up to lagged time n

```python
def compute_RE_metric(j, first_idx, last_idx, online_fixed_mean_final, online_fixed_cov_all):
    """
    Compute Pₙʲ for fixed j over n ∈ {j, j+1, ..., last_idx}.

    Pₙʲ = KL( p_N(uʲ|y[1:N]) || p_n(uʲ|y[1:n]) )
         = 0.5 * (μ_N[j] - μ_n[j])² / σ²_n[j]
         + 0.5 * (σ²_N[j]/σ²_n[j] - 1 - ln(σ²_N[j]/σ²_n[j]))

    Returns:
        RE_n: array of length (last_idx - j + 1), RE values over lagged obs time
    """
    RE_n = np.zeros(last_idx - j + 1)
    for i, n in enumerate(range(j, last_idx + 1)):
        cov_ratio = online_fixed_cov_final[j] / online_fixed_cov_all[n][j]
        mean_diff_sq = (online_fixed_mean_final[j] - online_fixed_mean_all[n][j])**2
        RE_n[i] = 0.5 * mean_diff_sq / online_fixed_cov_all[n][j] \
                  + 0.5 * (cov_ratio - 1.0 - np.log(cov_ratio))
    return RE_n
```

### 5.2 Approximate Objective CIR Length

```python
def compute_approx_objective_CIR(RE_metric, max_RE_metric, dt, threshold=1e-5):
    """
    Approximate objective CIR using time-integral approximation.

    Objective CIR ≈ (∫ Pₙʲ dn) / max(Pₙʲ)

    where the integral is computed using Simpson's rule (or trapezoidal).

    Args:
        RE_metric:      2D array [plot_len x plot_len], RE_metric[j_idx, n_offset]
        max_RE_metric:  1D array [plot_len], max over n for each j
        dt:             timestep
        threshold:      minimum max_RE to compute (avoid numerical noise)

    Returns:
        approx_obj_CIR: 1D array [plot_len], approximate objective CIR at each t
    """
    plot_len = len(max_RE_metric)
    approx_obj_CIR = np.zeros(plot_len)

    for j_idx in range(plot_len):
        RE_n = RE_metric[j_idx, j_idx:]  # n >= j
        if np.max(RE_n) > threshold:
            # Simpson's rule integration
            approx_obj_CIR[j_idx] = simpson(RE_n) * dt / np.max(RE_n)
        else:
            approx_obj_CIR[j_idx] = 0.0

    return approx_obj_CIR
```

### 5.3 Subjective CIR Length

```python
def compute_subjective_CIR(RE_metric, eps_values, dt, first_idx, last_idx):
    """
    Subjective CIR length for each ε and each time t.

    Subjective CIR(t, ε) = last n where Pₙʲ > ε, multiplied by dt.
    (i.e., the "range" in time over which adding observations still
     provides more than ε bits of information about the unobservable)

    Args:
        RE_metric:  2D array [plot_len x plot_len]
        eps_values: array of ε values (descending order, e.g. 10^0.5 to 10^-6)
        dt:         timestep

    Returns:
        subjective_CIR: 2D array [len(eps_values) x plot_len]
    """
    n_eps = len(eps_values)
    plot_len = RE_metric.shape[0]
    subjective_CIR = np.zeros((n_eps, plot_len))

    for eps_idx, epsilon in enumerate(eps_values):
        for j_idx in range(plot_len):
            RE_n = RE_metric[j_idx, j_idx:]
            # Find LAST index where RE_n > epsilon
            above_mask = RE_n > epsilon
            if np.any(above_mask):
                subj_idx = np.max(np.where(above_mask)[0])
            else:
                subj_idx = 0  # no information above threshold
            subjective_CIR[eps_idx, j_idx] = subj_idx * dt

    return subjective_CIR
```

### 5.4 Definition-Based Objective CIR (Exact)

```python
def compute_definition_objective_CIR(subjective_CIR, max_RE_metric,
                                     eps_ord_values, dt, lookahead_trim):
    """
    Exact objective CIR by integrating subjective CIR over ε:

    Objective CIR(t) = (∫ subjective_CIR(t,ε) dε) / max_RE(t)

    Uses Simpson's rule over the ε axis.
    The flip operations reverse arrays to put ε in ascending order.
    """
    # Reverse to ascending ε order
    eps_asc = 10.0 ** np.flip(eps_ord_values)
    scir_trimmed = subjective_CIR[:, :lookahead_trim]   # trim lookahead
    scir_flipped = np.flipud(scir_trimmed)
    max_RE_trimmed = max_RE_metric[:lookahead_trim]

    # Simpson's rule integration over ε axis (axis=0)
    obj_CIR = np.zeros(scir_flipped.shape[1])
    for j in range(scir_flipped.shape[1]):
        obj_CIR[j] = simpson(scir_flipped[:, j], x=eps_asc)

    obj_CIR /= max_RE_trimmed
    return obj_CIR
```

---

## 6. Complete Pipeline — End to End

```python
def run_aci_pipeline(obs_series, unobs_series, N, dt,
                     L_u, L_o, f_u, f_o,
                     Sx_1, Sx_2, Sy_1, Sy_2,
                     time_start_plot=0, time_end_plot=50,
                     lookahead_tolerance=5, epsilon_resolution=513,
                     lowest_order=-6, highest_order=0.5):
    """
    Complete ACI + CIR pipeline.

    Args:
        obs_series:    observed variable array [N+1]
        unobs_series:  unobserved variable array [N+1] (for plotting/truth comparison)
        L_u, L_o, f_u, f_o: model coefficients as arrays
        Sx_1, Sx_2:    unobservable noise coefficients
        Sy_1, Sy_2:    observable noise coefficients
        ... plus plotting/CIR parameters

    Returns dict with all results.
    """

    # Step 1: Precompute noise Grammians
    S_uu = Sx_1**2 + Sx_2**2
    S_oo = Sy_1**2 + Sy_2**2
    S_oo_inv = 1.0 / S_oo
    S_uo = Sx_1*Sy_1 + Sx_2*Sy_2
    S_ou = S_uo

    # Step 2: Kalman Filter
    filter_mean, filter_cov = kalman_filter_cgns(
        N, dt, obs_series, L_u, L_o, f_u, f_o,
        S_oo_inv, S_uu, S_uo,
        filter_mean_init=unobs_series[0],
        filter_cov_init=0.1
    )

    # Step 3: RTS Backward Smoother + online auxiliary matrices
    smoother_mean, smoother_cov, E_j, F_j = rts_smoother_cgns(
        N, dt, obs_series,
        filter_mean, filter_cov,
        L_u, L_o, f_u, f_o,
        S_oo_inv, S_uu, S_uo, S_ou
    )

    # Step 4: ACI Metric
    aci_metric = compute_aci_metric(smoother_mean, filter_mean, smoother_cov, filter_cov)

    # Step 5: Online Fixed-Lag Smoother
    online_fixed_mean, online_fixed_cov = online_fixed_lag_smoother_cgns(
        N, dt, obs_series,
        filter_mean, filter_cov,
        E_j, F_j, L_u, L_o, f_u, f_o
    )

    # Step 6: CIR Computation
    T = N * dt
    first_idx = int(round(time_start_plot / dt))
    if time_end_plot + lookahead_tolerance < T:
        last_idx = int(round((time_end_plot + lookahead_tolerance) / dt))
    else:
        last_idx = int(round(time_end_plot / dt))
    plot_len = last_idx - first_idx + 1

    # Build RE metric matrix
    RE_metric = np.zeros((plot_len, plot_len))
    max_RE_metric = np.zeros(plot_len)

    for j_offset in range(plot_len):
        j = first_idx + j_offset
        RE_n = np.zeros(last_idx - j + 1)
        for i, n in enumerate(range(j, last_idx + 1)):
            cov_ratio = online_fixed_cov[N][j] / online_fixed_cov[n][j]
            mean_diff = (online_fixed_mean[N][j] - online_fixed_mean[n][j])**2
            RE_n[i] = 0.5 * mean_diff / online_fixed_cov[n][j] \
                      + 0.5 * (cov_ratio - 1.0 - np.log(cov_ratio))
        max_RE_metric[j_offset] = np.max(RE_n)
        RE_metric[j_offset, j_offset:j_offset + len(RE_n)] = RE_n

    # Approximate objective CIR
    approx_obj_CIR = compute_approx_objective_CIR(RE_metric, max_RE_metric, dt)

    # Subjective CIRs over ε grid
    eps_ord_values = np.flip(np.linspace(lowest_order, highest_order, epsilon_resolution))
    subjective_CIR = compute_subjective_CIR(RE_metric, 10**eps_ord_values, dt,
                                            first_idx, last_idx)

    # Definition-based objective CIR
    lookahead_trim = int(round(lookahead_tolerance / dt))
    defn_obj_CIR = compute_definition_objective_CIR(
        subjective_CIR, max_RE_metric, eps_ord_values, dt, lookahead_trim
    )

    return {
        'filter_mean': filter_mean,
        'filter_cov': filter_cov,
        'smoother_mean': smoother_mean,
        'smoother_cov': smoother_cov,
        'aci_metric': aci_metric,
        'RE_metric': RE_metric,
        'max_RE_metric': max_RE_metric,
        'subjective_CIR': subjective_CIR,
        'approx_objective_CIR': approx_obj_CIR,
        'definition_objective_CIR': defn_obj_CIR,
    }
```

---

## 7. Multi-Variable (Dyadic) Case — Notes

Since `dyad_interaction_model.m` was not found in the repository, here are the
generalization notes for extending to the multi-variable case based on the
algorithm structure:

### 7.1 Scalar → Matrix Generalization

For d-dimensional unobservable u and m-dimensional observable o:

| Component | Scalar Case | Matrix Case |
|---|---|---|
| `filter_cov` | R ∈ ℝ (scalar) | R ∈ ℝ^(d×d) (matrix) |
| `S_uu` | scalar | S_u·S_uᵀ ∈ ℝ^(d×d) |
| `S_oo_inv` | 1/S_oo (scalar) | (S_o·S_oᵀ)⁻¹ ∈ ℝ^(m×m) |
| `S_uo` | scalar | S_u·S_oᵀ ∈ ℝ^(d×m) |
| `aux` | scalar | S_uo + R·L_oᵀ ∈ ℝ^(d×m) |
| `E_j` | scalar | matrix ∈ ℝ^(d×d) |
| `F_j` | scalar | matrix ∈ ℝ^(d×m) |
| `K_j` | S_oo_inv * G_o | S_oo_inv · G_o ∈ ℝ^(m×d) |

### 7.2 Key Matrix-Order Changes in Filter

```python
# Scalar:  aux = S_uo + R * L_o[j-1]
# Matrix:  aux = S_uo + R @ L_o[j-1].T

# Scalar:  mu += aux * S_oo_inv * innovation
# Matrix:  mu += aux @ S_oo_inv @ innovation

# Scalar:  R += (L_u*R + R*L_u + S_uu - aux*S_oo_inv*aux) * dt
# Matrix:  R += (L_u@R + R@L_u.T + S_uu - aux@S_oo_inv@aux.T) * dt
```

### 7.3 Key Matrix-Order Changes in Smoother

```python
# Scalar:  A_j = L_u[j] - S_uo * S_oo_inv * L_o[j]
# Matrix:  A_j = L_u[j] - S_uo @ S_oo_inv @ L_o[j]

# Scalar:  B_j = S_uu - S_uo * S_oo_inv * S_ou
# Matrix:  B_j = S_uu - S_uo @ S_oo_inv @ S_ou

# Scalar:  R -= ((A+B/R)*R + R*(A+B/R) - B) * dt
# Matrix:  R -= ((A+B@R⁻¹)@R + R@(A+B@R⁻¹).T - B) * dt
```

### 7.4 CIR KL Divergence for Multivariate Gaussian

```python
def kl_divergence_gaussian(mu1, Sigma1, mu2, Sigma2):
    """KL(N(mu1,Sigma1) || N(mu2,Sigma2)) for multivariate Gaussians."""
    d = len(mu1)
    Sigma2_inv = np.linalg.inv(Sigma2)
    diff = mu1 - mu2
    return 0.5 * (np.trace(Sigma2_inv @ Sigma1)
                   + diff @ Sigma2_inv @ diff
                   - d
                   - np.log(np.linalg.det(Sigma1) / np.linalg.det(Sigma2)))
```

---

## 8. Reference Equations (from paper supplementary info)

| Equation | Section | Description |
|---|---|---|
| Filter mean | SI §2.1.2 | μ = μ₀ + (L_u·μ₀ + f_u)dt + aux·S⁻¹_oo·(Δy - (L_o·μ₀ + f_o)dt) |
| Filter cov | SI §2.1.2 | R = R₀ + (L_u·R₀ + R₀·L_u + S_uu - aux·S⁻¹_oo·aux)dt |
| Smoother mean | SI §2.1.2 | μ = μ_T - (L_u·μ_T + f_u - B/R·(μ_f - μ_T))dt + S_uo·S⁻¹_oo·(-Δy + ...)dt |
| Smoother cov | SI §2.1.2 | R = R_T - ((A+B/R)·R + R·(A+B/R) - B)dt |
| Online smoother | SI §2.2 | E_j, F_j update matrices; innovation-based propagation |
| ACI metric | SI §2.1 | KL(smoother ‖ filter) = signal + dispersion terms |
| Subjective CIR | SI §1.5.2 | L_subj(t,ε) = max{n-j : Pₙʲ > ε} · dt |
| Objective CIR (approx) | SI §1.5.3 | L_obj ≈ (∫ Pₙʲ dn) / max(Pₙʲ) |
| Objective CIR (defn) | SI §1.5.3 | L_obj = (∫ L_subj(t,ε) dε) / max_RE |
| Online smoother paper | arXiv:2411.05870 | Fixed-lag CGNS online smoother |
| CGNS intro paper | arXiv:2410.24056 | Martingale-free introduction to CGNS |
